import {
  PROCTOR_COUNTED_TYPES,
  emptyProctorCounts,
  normalizeTopicKey,
  type AnalyticsSnapshot,
  type LeaderboardEntry,
  type ProctorCountedType,
} from '@quizup/shared';
import type { SessionAnalyticsSource } from '../live/types.js';
import { SessionAnalytics } from './sessionAnalytics.js';

const LEADERBOARD_ENTRIES = 10;

export function rebuildAnalyticsSnapshot(
  source: SessionAnalyticsSource,
  generatedAtMs: number,
): AnalyticsSnapshot {
  const analytics = new SessionAnalytics({
    sessionId: source.session.id,
    adaptive: false,
    totalRounds: null,
    source: 'rebuilt',
    mode: source.session.exam_duration_minutes === null ? 'live' : 'exam',
  });

  analytics.setProctored(source.session.proctored);

  const questionById = new Map(source.questions.map((question) => [question.id, question]));
  const topicLabelByKey = new Map(
    source.questions.map((question) => [normalizeTopicKey(question.topic), question.topic]),
  );
  const joinedAtById = new Map<string, number>();
  for (const participant of source.participants) {
    analytics.registerParticipant(participant.id, participant.displayName);
    analytics.setRating(participant.id, participant.elo);
    analytics.setDevices(participant.id, participant.devices);
    joinedAtById.set(participant.id, participant.joinedAtMs);
  }

  const ordered = [...source.responses].sort(
    (first, second) =>
      first.answeredAtMs - second.answeredAtMs ||
      first.participantId.localeCompare(second.participantId),
  );
  const examDurationMs =
    source.session.exam_duration_minutes === null
      ? null
      : source.session.exam_duration_minutes * 60_000;
  const durationMs =
    examDurationMs ?? Math.max(1, ...ordered.map((response) => response.responseMs));
  const answeredCountByParticipant = new Map<string, number>();
  let roundsCompleted = 0;
  const totalResponseMs = new Map<string, number>();

  for (const response of ordered) {
    const question = questionById.get(response.questionId);
    if (!question) {
      continue;
    }
    const round = (answeredCountByParticipant.get(response.participantId) ?? 0) + 1;
    answeredCountByParticipant.set(response.participantId, round);
    roundsCompleted = Math.max(roundsCompleted, round);
    totalResponseMs.set(
      response.participantId,
      (totalResponseMs.get(response.participantId) ?? 0) + response.responseMs,
    );
    analytics.onQuestionServed(
      {
        id: question.id,
        stem: question.stem,
        topic: question.topic,
        difficulty: question.difficulty,
        answersCount: question.answersCount,
      },
      round,
    );
    analytics.onResponse({
      participantId: response.participantId,
      questionId: response.questionId,
      round,
      correct: response.correct,
      points: response.points,
      responseMs: response.responseMs,
      durationMs,
    });
  }
  analytics.onRoundClose(roundsCompleted);

  const countsByParticipant = new Map<string, ReturnType<typeof emptyProctorCounts>>();
  for (const event of source.proctorEvents) {
    if (!PROCTOR_COUNTED_TYPES.includes(event.type as ProctorCountedType)) {
      continue;
    }
    const counts = countsByParticipant.get(event.participantId) ?? emptyProctorCounts();
    counts[event.type as ProctorCountedType] += 1;
    countsByParticipant.set(event.participantId, counts);
  }
  for (const participant of source.participants) {
    analytics.setProctorCounts(
      participant.id,
      countsByParticipant.get(participant.id) ?? emptyProctorCounts(),
    );
  }

  for (const state of source.knowledgeStates) {
    analytics.onMastery(
      state.participantId,
      topicLabelByKey.get(normalizeTopicKey(state.topic)) ?? state.topic,
      state.pMastery,
    );
  }

  const scoreById = new Map<string, number>();
  for (const response of ordered) {
    scoreById.set(
      response.participantId,
      (scoreById.get(response.participantId) ?? 0) + response.points,
    );
  }
  const ranked = [...source.participants].sort(
    (first, second) =>
      (scoreById.get(second.id) ?? 0) - (scoreById.get(first.id) ?? 0) ||
      (totalResponseMs.get(first.id) ?? 0) - (totalResponseMs.get(second.id) ?? 0) ||
      first.joinedAtMs - second.joinedAtMs ||
      first.id.localeCompare(second.id),
  );
  const ranks = ranked.map((participant, position) => ({
    participantId: participant.id,
    rank: position + 1,
  }));
  const leaderboard: LeaderboardEntry[] = ranked
    .slice(0, LEADERBOARD_ENTRIES)
    .map((participant, position) => ({
      participantId: participant.id,
      displayName: participant.displayName,
      score: scoreById.get(participant.id) ?? 0,
      rank: position + 1,
    }));

  return analytics.buildSnapshot({
    status: source.session.status,
    generatedAtMs,
    ranks,
    leaderboard,
    includeMedians: true,
  });
}
