import {
  summarizeFeedback,
  type Ack,
  type FeedbackSubmitPayload,
  type MeResponse,
  type SessionFeedbackResponse,
} from '@quizup/shared';
import type { ExamService } from '../exam/examService.js';
import type { LiveEngine } from '../live/engine.js';

export async function submitFeedback(
  dependencies: { engine: LiveEngine; exam: ExamService },
  participantId: string,
  payload: FeedbackSubmitPayload,
): Promise<Ack> {
  const { engine, exam } = dependencies;
  const reference = engine.getParticipantRef(participantId);
  if (!reference) {
    return { ok: false, error: 'not_in_room' };
  }
  const ended = engine.getSessionStatus(reference.sessionId) === 'ended';
  if (!ended && !exam.hasSubmitted(participantId)) {
    return { ok: false, error: 'feedback_not_open' };
  }
  await engine.repository.upsertSessionFeedback({
    sessionId: reference.sessionId,
    participantId,
    rating: payload.rating,
    comment: payload.comment ?? null,
  });
  return { ok: true };
}

export async function getSessionFeedback(
  engine: LiveEngine,
  sessionId: string,
  user: MeResponse,
): Promise<SessionFeedbackResponse | null> {
  const stored = await engine.repository.findSessionWithHost(sessionId);
  if (!stored || (stored.hostId !== user.id && user.role !== 'admin')) {
    return null;
  }
  const rows = await engine.repository.listSessionFeedback(sessionId);
  return {
    ...summarizeFeedback(rows),
    items: rows
      .map((row) => ({ rating: row.rating, comment: row.comment }))
      .sort((first, second) => second.rating - first.rating),
  };
}
