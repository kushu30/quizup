import {
  applyParticipantResponse,
  applyQuestionResponse,
  bucketIndex,
  difficultyMismatch,
  emptyHistogram,
  emptyParticipantAggregate,
  emptyQuestionAggregate,
  incrementBucket,
  medianOf,
  normalizeTopicKey,
  observedAccuracy,
  projectScore,
  type AnalyticsSnapshot,
  type AnalyticsTopic,
  type Difficulty,
  type LeaderboardEntry,
  type ParticipantAggregate,
  type ParticipantAnalytics,
  type QuestionAggregate,
  type QuestionAnalytics,
  type SessionStatus,
} from '@quizup/shared';

export interface SessionAnalyticsOptions {
  sessionId: string;
  adaptive: boolean;
  totalRounds: number | null;
  source?: 'live' | 'rebuilt';
}

export interface ServedQuestion {
  id: string;
  stem: string;
  topic: string;
  difficulty: Difficulty;
}

export interface AnalyticsResponseEvent {
  participantId: string;
  questionId: string;
  round: number;
  correct: boolean;
  points: number;
  responseMs: number;
  durationMs: number;
}

export interface AnalyticsSnapshotInput {
  status: SessionStatus;
  generatedAtMs: number;
  ranks: { participantId: string; rank: number }[];
  leaderboard: LeaderboardEntry[];
  includeMedians: boolean;
}

interface ParticipantEntry {
  displayName: string;
  aggregate: ParticipantAggregate;
  rating: number | null;
  checkpointProjection: number | null;
}

interface QuestionEntry {
  meta: ServedQuestion;
  firstRound: number;
  aggregate: QuestionAggregate;
  responseMsSamples: number[];
}

export class SessionAnalytics {
  private readonly sessionId: string;
  private readonly adaptive: boolean;
  private readonly totalRounds: number | null;
  private readonly source: 'live' | 'rebuilt';
  private readonly participants = new Map<string, ParticipantEntry>();
  private readonly mastery = new Map<string, Map<string, number>>();
  private readonly topics = new Map<string, string>();
  private readonly questions = new Map<string, QuestionEntry>();
  private sessionHistogram = emptyHistogram();
  private currentRoundHistogram = emptyHistogram();
  private roundsCompleted = 0;
  private currentRound: number | null = null;
  private checkpointRound: number | null = null;

  constructor(options: SessionAnalyticsOptions) {
    this.sessionId = options.sessionId;
    this.adaptive = options.adaptive;
    this.totalRounds = options.totalRounds;
    this.source = options.source ?? 'live';
  }

  registerParticipant(participantId: string, displayName: string) {
    if (!this.participants.has(participantId)) {
      this.participants.set(participantId, {
        displayName,
        aggregate: emptyParticipantAggregate(),
        rating: null,
        checkpointProjection: null,
      });
    }
  }

  registerTopic(topic: string) {
    const key = normalizeTopicKey(topic);
    if (!this.topics.has(key)) {
      this.topics.set(key, topic.trim());
    }
  }

  onRoundStart(round: number) {
    this.currentRound = round;
    this.currentRoundHistogram = emptyHistogram();
  }

  onQuestionServed(question: ServedQuestion, round: number) {
    this.registerTopic(question.topic);
    if (!this.questions.has(question.id)) {
      this.questions.set(question.id, {
        meta: question,
        firstRound: round,
        aggregate: emptyQuestionAggregate(),
        responseMsSamples: [],
      });
    }
  }

  onResponse(event: AnalyticsResponseEvent) {
    const participant = this.participants.get(event.participantId);
    const question = this.questions.get(event.questionId);
    if (!participant || !question) {
      return;
    }
    const bucket = bucketIndex(event.responseMs, event.durationMs);

    participant.aggregate = applyParticipantResponse(participant.aggregate, {
      correct: event.correct,
      points: event.points,
      responseMs: event.responseMs,
      round: event.round,
    });
    question.aggregate = applyQuestionResponse(question.aggregate, {
      correct: event.correct,
      bucket,
    });
    question.responseMsSamples.push(event.responseMs);
    this.sessionHistogram = incrementBucket(this.sessionHistogram, bucket);
    if (event.round === this.currentRound) {
      this.currentRoundHistogram = incrementBucket(this.currentRoundHistogram, bucket);
    }
  }

  onMastery(participantId: string, topic: string, pMastery: number) {
    this.registerTopic(topic);
    const key = normalizeTopicKey(topic);
    const forParticipant = this.mastery.get(participantId) ?? new Map<string, number>();
    forParticipant.set(key, pMastery);
    this.mastery.set(participantId, forParticipant);
  }

  setRating(participantId: string, rating: number) {
    const participant = this.participants.get(participantId);
    if (participant) {
      participant.rating = rating;
    }
  }

  onRoundClose(round: number) {
    this.roundsCompleted = Math.max(this.roundsCompleted, round);
    if (
      this.totalRounds !== null &&
      this.checkpointRound === null &&
      this.roundsCompleted === Math.ceil(this.totalRounds / 2)
    ) {
      this.checkpointRound = this.roundsCompleted;
      for (const participant of this.participants.values()) {
        participant.checkpointProjection = this.projectionFor(participant)?.projected ?? null;
      }
    }
  }

  private projectionFor(participant: ParticipantEntry) {
    return projectScore({
      sums: participant.aggregate.regression,
      currentScore: participant.aggregate.score,
      totalRounds: this.totalRounds,
      roundsCompleted: this.roundsCompleted,
      adaptive: this.adaptive,
    });
  }

  buildSnapshot(input: AnalyticsSnapshotInput): AnalyticsSnapshot {
    const topics: AnalyticsTopic[] = [...this.topics].map(([key, label]) => ({ key, label }));

    const rankById = new Map(input.ranks.map((entry) => [entry.participantId, entry.rank]));
    const participants: ParticipantAnalytics[] = [...this.participants]
      .map(([participantId, participant]) => {
        const masteryForParticipant = this.mastery.get(participantId);
        const { aggregate } = participant;
        return {
          participantId,
          displayName: participant.displayName,
          rank: rankById.get(participantId) ?? this.participants.size,
          score: aggregate.score,
          answered: aggregate.answered,
          correct: aggregate.correct,
          avgResponseMs:
            aggregate.answered === 0 ? null : aggregate.responseMsSum / aggregate.answered,
          rating: this.adaptive ? participant.rating : null,
          projection: this.projectionFor(participant),
          checkpointProjection: participant.checkpointProjection,
          mastery: topics.map((topic) => masteryForParticipant?.get(topic.key) ?? null),
        };
      })
      .sort((first, second) => first.rank - second.rank);

    const questions: QuestionAnalytics[] = [...this.questions.values()]
      .sort((first, second) => first.firstRound - second.firstRound)
      .map((entry) => {
        const accuracy = observedAccuracy(entry.aggregate.answered, entry.aggregate.correct);
        return {
          questionId: entry.meta.id,
          stem: entry.meta.stem,
          topic: entry.meta.topic,
          labeledDifficulty: entry.meta.difficulty,
          round: entry.firstRound,
          answered: entry.aggregate.answered,
          correct: entry.aggregate.correct,
          accuracy,
          mismatch: difficultyMismatch(entry.meta.difficulty, accuracy, entry.aggregate.answered),
          histogram: entry.aggregate.histogram,
          medianResponseMs: input.includeMedians ? medianOf(entry.responseMsSamples) : null,
        };
      });

    return {
      sessionId: this.sessionId,
      source: this.source,
      status: input.status,
      generatedAtMs: input.generatedAtMs,
      adaptive: this.adaptive,
      totalRounds: this.totalRounds,
      roundsCompleted: this.roundsCompleted,
      currentRound: this.currentRound,
      checkpointRound: this.checkpointRound,
      topics,
      questions,
      sessionHistogram: this.sessionHistogram,
      currentRoundHistogram: this.currentRoundHistogram,
      participants,
      leaderboard: input.leaderboard,
    };
  }
}
