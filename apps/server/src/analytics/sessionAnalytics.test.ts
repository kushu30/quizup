import { randomUUID } from 'node:crypto';
import {
  createSeededRandom,
  medianOf,
  type AnalyticsSnapshot,
  type Difficulty,
  type RandomSource,
} from '@quizup/shared';
import { describe, expect, it } from 'vitest';
import { SessionAnalytics } from './sessionAnalytics.js';

interface Event {
  participantId: string;
  questionId: string;
  round: number;
  correct: boolean;
  points: number;
  responseMs: number;
  durationMs: number;
}

interface PoolQuestion {
  id: string;
  stem: string;
  topic: string;
  difficulty: Difficulty;
}

interface Stream {
  participants: { id: string; name: string }[];
  pool: PoolQuestion[];
  rounds: { round: number; served: PoolQuestion[]; events: Event[] }[];
  totalRounds: number;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const TOPICS = ['Algebra', 'Geometry', 'Stats'];

function shuffled<Item>(items: Item[], random: RandomSource): Item[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random.next() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap] as Item, copy[index] as Item];
  }
  return copy;
}

function buildStream(seed: number, adaptive: boolean): Stream {
  const random = createSeededRandom(seed);
  const totalRounds = 6 + Math.floor(random.next() * 4);
  const participants = Array.from({ length: 7 }, (_, index) => ({
    id: randomUUID(),
    name: `P${index}`,
  }));
  const pool: PoolQuestion[] = Array.from({ length: totalRounds * 2 }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index}`,
    topic: TOPICS[index % TOPICS.length] as string,
    difficulty: DIFFICULTIES[index % DIFFICULTIES.length] as Difficulty,
  }));
  const durationChoices = [1000, 2000, 10_000, 20_000];
  const unservedByParticipant = new Map(
    participants.map((participant) => [participant.id, shuffled(pool, random)]),
  );

  const rounds: Stream['rounds'] = [];
  for (let round = 1; round <= totalRounds; round += 1) {
    const durationMs = durationChoices[
      Math.floor(random.next() * durationChoices.length)
    ] as number;
    const sharedQuestion = pool[round - 1] as PoolQuestion;
    const served = new Set<PoolQuestion>();
    const events: Event[] = [];
    for (const participant of shuffled(participants, random)) {
      const question = adaptive
        ? (unservedByParticipant.get(participant.id) as PoolQuestion[]).pop()
        : sharedQuestion;
      if (!question) {
        continue;
      }
      served.add(question);
      if (random.next() < 0.2) {
        continue;
      }
      const correct = random.next() < 0.6;
      const responseMs = Math.floor(random.next() * durationMs * 1.3);
      events.push({
        participantId: participant.id,
        questionId: question.id,
        round,
        correct,
        points: correct ? 500 + Math.round(500 * (1 - Math.min(responseMs / durationMs, 1))) : 0,
        responseMs,
        durationMs,
      });
    }
    rounds.push({ round, served: [...served], events });
  }
  return { participants, pool, rounds, totalRounds };
}

function runIncremental(stream: Stream, adaptive: boolean): AnalyticsSnapshot {
  const analytics = new SessionAnalytics({
    sessionId: randomUUID(),
    adaptive,
    totalRounds: stream.totalRounds,
  });
  for (const participant of stream.participants) {
    analytics.registerParticipant(participant.id, participant.name);
  }
  for (const round of stream.rounds) {
    analytics.onRoundStart(round.round);
    for (const question of round.served) {
      analytics.onQuestionServed(question, round.round);
    }
    for (const event of round.events) {
      analytics.onResponse(event);
    }
    analytics.onRoundClose(round.round);
  }
  return analytics.buildSnapshot({
    status: 'ended',
    generatedAtMs: 0,
    ranks: stream.participants.map((participant, index) => ({
      participantId: participant.id,
      rank: index + 1,
    })),
    leaderboard: [],
    includeMedians: true,
  });
}

function batchBucket(responseMs: number, durationMs: number): number {
  for (let bucket = 9; bucket >= 1; bucket -= 1) {
    if (responseMs * 10 >= bucket * durationMs) {
      return bucket;
    }
  }
  return 0;
}

describe('incremental aggregation equals a full batch recompute', () => {
  for (const adaptive of [false, true]) {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      it(`seed ${seed}, ${adaptive ? 'adaptive' : 'shared question'} stream`, () => {
        const stream = buildStream(seed, adaptive);
        const snapshot = runIncremental(stream, adaptive);
        const allEvents = stream.rounds.flatMap((round) => round.events);

        const sessionHistogram = new Array<number>(10).fill(0);
        for (const event of allEvents) {
          const bucket = batchBucket(event.responseMs, event.durationMs);
          sessionHistogram[bucket] = (sessionHistogram[bucket] ?? 0) + 1;
        }
        expect(snapshot.sessionHistogram).toEqual(sessionHistogram);

        const lastRoundHistogram = new Array<number>(10).fill(0);
        for (const event of stream.rounds[stream.rounds.length - 1]?.events ?? []) {
          const bucket = batchBucket(event.responseMs, event.durationMs);
          lastRoundHistogram[bucket] = (lastRoundHistogram[bucket] ?? 0) + 1;
        }
        expect(snapshot.currentRoundHistogram).toEqual(lastRoundHistogram);

        for (const question of snapshot.questions) {
          const events = allEvents.filter((event) => event.questionId === question.questionId);
          const histogram = new Array<number>(10).fill(0);
          for (const event of events) {
            const bucket = batchBucket(event.responseMs, event.durationMs);
            histogram[bucket] = (histogram[bucket] ?? 0) + 1;
          }
          expect(question.answered).toBe(events.length);
          expect(question.correct).toBe(events.filter((event) => event.correct).length);
          expect(question.histogram).toEqual(histogram);
          expect(question.accuracy).toBe(
            events.length === 0
              ? null
              : events.filter((event) => event.correct).length / events.length,
          );
          expect(question.medianResponseMs).toBe(medianOf(events.map((event) => event.responseMs)));
        }
        expect(snapshot.questions.reduce((sum, question) => sum + question.answered, 0)).toBe(
          allEvents.length,
        );

        for (const participant of snapshot.participants) {
          const events = allEvents.filter(
            (event) => event.participantId === participant.participantId,
          );
          const running = events.reduce((sum, event) => sum + event.points, 0);
          expect(participant.score).toBe(running);
          expect(participant.answered).toBe(events.length);
          expect(participant.correct).toBe(events.filter((event) => event.correct).length);
          if (events.length === 0) {
            expect(participant.avgResponseMs).toBeNull();
          } else {
            expect(participant.avgResponseMs).toBeCloseTo(
              events.reduce((sum, event) => sum + event.responseMs, 0) / events.length,
              9,
            );
          }
        }
      });
    }
  }

  it('carries no projection fields', () => {
    const snapshot = runIncremental(buildStream(3, false), false);
    expect(snapshot).not.toHaveProperty('checkpointRound');
    for (const participant of snapshot.participants) {
      expect(participant).not.toHaveProperty('projection');
      expect(participant).not.toHaveProperty('checkpointProjection');
    }
  });

  it('keeps mastery cells null until a mastery update arrives', () => {
    const analytics = new SessionAnalytics({
      sessionId: randomUUID(),
      adaptive: false,
      totalRounds: 3,
    });
    const participantId = randomUUID();
    analytics.registerParticipant(participantId, 'Ada');
    analytics.registerTopic(' Algebra ');
    analytics.registerTopic('geometry');
    const input = {
      status: 'running' as const,
      generatedAtMs: 0,
      ranks: [{ participantId, rank: 1 }],
      leaderboard: [],
      includeMedians: false,
    };
    expect(analytics.buildSnapshot(input).participants[0]?.mastery).toEqual([null, null]);

    analytics.onMastery(participantId, 'ALGEBRA', 0.7);
    const snapshot = analytics.buildSnapshot(input);
    expect(snapshot.topics.map((topic) => topic.key)).toEqual(['algebra', 'geometry']);
    expect(snapshot.participants[0]?.mastery).toEqual([0.7, null]);
  });
});
