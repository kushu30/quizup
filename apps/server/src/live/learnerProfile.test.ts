import { randomUUID } from 'node:crypto';
import { bktUpdate, type AnalyticsSnapshot, type RoomStatePayload } from '@quizup/shared';
import { createSeededRandom } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from './inMemoryRepository.js';
import {
  STUDENT_ACCOUNT,
  STUDENT_TWO_ACCOUNT,
  TEST_HOST,
  sleep,
  startLiveHarness,
} from './liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

function algebraPool(count = 3): SeedQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    stem: `Algebra ${index}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: index % 4,
    topic: 'Algebra',
    difficulty: 'medium',
  }));
}

describe('learner profiles', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  async function setup(settings: Record<string, unknown>) {
    harness = await startLiveHarness({ random: createSeededRandom(9) });
    const questions = algebraPool();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings,
      questions,
    });
    const summary = await harness.createSession(quizId, 400);
    return { questions, summary };
  }

  async function playOneRound(
    summary: Awaited<ReturnType<typeof setup>>['summary'],
    questions: SeedQuestion[],
    students: Awaited<ReturnType<Harness['joinAsStudent']>>[],
  ) {
    const shownPromises = students.map((student) =>
      harness.nextEvent(student.socket, 'question:show'),
    );
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    const shown = await Promise.all(shownPromises);
    await harness.waitUntil(Math.max(...shown.map((event) => event.startsAtServerMs)));
    for (const [index, student] of students.entries()) {
      const event = shown[index];
      await student.socket.emitWithAck('answer:submit', {
        questionId: event?.questionId ?? '',
        chosenIndex:
          questions.find((question) => question.id === event?.questionId)?.correctIndex ?? 0,
      });
    }
    await sleep(150);
    await harness.engine.settlePersistence();
  }

  const adaptive = { adaptive: true, adaptiveRounds: 1 };

  it('seeds Elo and per-topic mastery from a stored profile and writes the result back at the end', async () => {
    const { summary, questions } = await setup(adaptive);
    harness.repository.learnerProfiles.set(STUDENT_ACCOUNT.id, {
      userId: STUDENT_ACCOUNT.id,
      elo: 1300,
      topicMastery: { ' Algebra ': 0.8, geometry: 0.4 },
      answersCount: 12,
      lastSessionId: null,
    });
    const hostSocket = await harness.joinAsHost(summary.session.id);
    const hostStates = harness.collectEvents(hostSocket, 'room:state');
    const student = await harness.joinAsStudent(summary.joinCode, 'Ada', 'student-token');

    const row = harness.repository.participants.find(
      (participant) => participant.id === student.participantId,
    );
    expect(row?.elo).toBe(1300);
    expect(row?.user_id).toBe(STUDENT_ACCOUNT.id);
    await sleep(60);
    const tableState = hostStates.filter((state) => state.adaptiveTable).pop() as RoomStatePayload;
    expect(tableState.adaptiveTable?.[0]?.rating).toBe(1300);

    await playOneRound(summary, questions, [student]);
    const afterRound = harness.repository.participants.find(
      (participant) => participant.id === student.participantId,
    );
    expect(afterRound?.elo).toBeGreaterThan(1300);

    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(50);
    const profile = harness.repository.learnerProfiles.get(STUDENT_ACCOUNT.id);
    expect(profile?.lastSessionId).toBe(summary.session.id);
    expect(profile?.answersCount).toBe(13);
    expect(profile?.elo).toBeCloseTo(afterRound?.elo ?? 0, 6);
    expect(profile?.topicMastery['algebra']).toBeCloseTo(bktUpdate(0.8, true), 9);
    expect(profile?.topicMastery['geometry']).toBe(0.4);
  });

  it('starts from the defaults without a profile and for participants without an account', async () => {
    const { summary, questions } = await setup(adaptive);
    harness.repository.learnerProfiles.set(STUDENT_TWO_ACCOUNT.id, {
      userId: STUDENT_TWO_ACCOUNT.id,
      elo: 2000,
      topicMastery: { algebra: 0.9 },
      answersCount: 4,
      lastSessionId: null,
    });
    const signedIn = await harness.joinAsStudent(summary.joinCode, 'Ada', 'student-token');
    const anonymous = await harness.joinAsStudent(summary.joinCode, 'Anon');

    const rows = harness.repository.participants;
    expect(rows.find((row) => row.id === signedIn.participantId)).toMatchObject({
      elo: 1000,
      user_id: STUDENT_ACCOUNT.id,
    });
    expect(rows.find((row) => row.id === anonymous.participantId)).toMatchObject({
      elo: 1000,
      user_id: null,
    });

    await playOneRound(summary, questions, [signedIn, anonymous]);
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(50);
    expect([...harness.repository.learnerProfiles.keys()].sort()).toEqual(
      [STUDENT_ACCOUNT.id, STUDENT_TWO_ACCOUNT.id].sort(),
    );
    expect(harness.repository.learnerProfiles.get(STUDENT_ACCOUNT.id)?.answersCount).toBe(1);
    expect(harness.repository.learnerProfiles.get(STUDENT_TWO_ACCOUNT.id)?.elo).toBe(2000);
  });

  it('clamps stored Elo to 100..3000', async () => {
    const { summary } = await setup(adaptive);
    harness.repository.learnerProfiles.set(STUDENT_ACCOUNT.id, {
      userId: STUDENT_ACCOUNT.id,
      elo: 9000,
      topicMastery: {},
      answersCount: 0,
      lastSessionId: null,
    });
    harness.repository.learnerProfiles.set(STUDENT_TWO_ACCOUNT.id, {
      userId: STUDENT_TWO_ACCOUNT.id,
      elo: -50,
      topicMastery: {},
      answersCount: 0,
      lastSessionId: null,
    });
    const high = await harness.joinAsStudent(summary.joinCode, 'High', 'student-token');
    const low = await harness.joinAsStudent(summary.joinCode, 'Low', 'student-two-token');
    const rows = harness.repository.participants;
    expect(rows.find((row) => row.id === high.participantId)?.elo).toBe(3000);
    expect(rows.find((row) => row.id === low.participantId)?.elo).toBe(100);
  });

  it('neither seeds nor writes when the host turns learner history off', async () => {
    const { summary, questions } = await setup({ ...adaptive, useLearnerHistory: false });
    const stored = {
      userId: STUDENT_ACCOUNT.id,
      elo: 1500,
      topicMastery: { algebra: 0.7 },
      answersCount: 6,
      lastSessionId: null,
    };
    harness.repository.learnerProfiles.set(STUDENT_ACCOUNT.id, { ...stored });
    const student = await harness.joinAsStudent(summary.joinCode, 'Ada', 'student-token');
    expect(
      harness.repository.participants.find((row) => row.id === student.participantId)?.elo,
    ).toBe(1000);

    await playOneRound(summary, questions, [student]);
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(50);
    expect(harness.repository.learnerProfiles.get(STUDENT_ACCOUNT.id)).toEqual(stored);
  });

  it('does not seed or write for sessions that are not adaptive', async () => {
    const { summary, questions } = await setup({});
    harness.repository.learnerProfiles.set(STUDENT_ACCOUNT.id, {
      userId: STUDENT_ACCOUNT.id,
      elo: 1500,
      topicMastery: {},
      answersCount: 6,
      lastSessionId: null,
    });
    const student = await harness.joinAsStudent(summary.joinCode, 'Ada', 'student-token');
    expect(
      harness.repository.participants.find((row) => row.id === student.participantId)?.elo,
    ).toBe(1000);
    await playOneRound(summary, questions, [student]);
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(50);
    expect(harness.repository.learnerProfiles.get(STUDENT_ACCOUNT.id)?.answersCount).toBe(6);
  });

  it('applies the end-of-session write exactly once', async () => {
    const { summary, questions } = await setup(adaptive);
    const student = await harness.joinAsStudent(summary.joinCode, 'Ada', 'student-token');
    await playOneRound(summary, questions, [student]);
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(50);
    expect(harness.repository.learnerProfiles.get(STUDENT_ACCOUNT.id)?.answersCount).toBe(1);

    const repeat = await harness.repository.applyLearnerProfile({
      userId: STUDENT_ACCOUNT.id,
      sessionId: summary.session.id,
      elo: 2500,
      topicMastery: { algebra: 0.99 },
      answersAdded: 5,
    });
    expect(repeat).toBe(false);
    const profile = harness.repository.learnerProfiles.get(STUDENT_ACCOUNT.id);
    expect(profile?.answersCount).toBe(1);
    expect(profile?.elo).not.toBe(2500);

    const nextSession = await harness.repository.applyLearnerProfile({
      userId: STUDENT_ACCOUNT.id,
      sessionId: randomUUID(),
      elo: 5000,
      topicMastery: {},
      answersAdded: 2,
    });
    expect(nextSession).toBe(true);
    expect(harness.repository.learnerProfiles.get(STUDENT_ACCOUNT.id)).toMatchObject({
      elo: 3000,
      answersCount: 3,
    });
  });

  it('lets a student erase only their own profile', async () => {
    harness = await startLiveHarness();
    harness.repository.learnerProfiles.set(STUDENT_ACCOUNT.id, {
      userId: STUDENT_ACCOUNT.id,
      elo: 1200,
      topicMastery: { algebra: 0.5 },
      answersCount: 3,
      lastSessionId: null,
    });
    harness.repository.learnerProfiles.set(STUDENT_TWO_ACCOUNT.id, {
      userId: STUDENT_TWO_ACCOUNT.id,
      elo: 900,
      topicMastery: {},
      answersCount: 1,
      lastSessionId: null,
    });

    expect((await harness.request('/me/learner-profile', 'bad-token', 'DELETE')).status).toBe(401);
    expect((await harness.request('/me/learner-profile', 'none', 'DELETE')).status).toBe(401);
    expect(harness.repository.learnerProfiles.size).toBe(2);

    const response = await harness.request('/me/learner-profile', 'student-token', 'DELETE');
    expect(response.status).toBe(204);
    expect(harness.repository.learnerProfiles.has(STUDENT_ACCOUNT.id)).toBe(false);
    expect(harness.repository.learnerProfiles.has(STUDENT_TWO_ACCOUNT.id)).toBe(true);

    expect((await harness.request('/me/learner-profile', 'student-token', 'DELETE')).status).toBe(
      204,
    );
    expect(harness.repository.learnerProfiles.size).toBe(1);
  });

  async function answerSingleQuestion(answersCount: number) {
    harness = await startLiveHarness({ random: createSeededRandom(3) });
    const question = { ...algebraPool(1)[0], answersCount } as SeedQuestion;
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: [question] });
    const summary = await harness.createSession(quizId, 400);
    const hostSocket = await harness.joinAsHost(summary.session.id);
    const snapshots = harness.collectEvents(hostSocket, 'analytics:snapshot');
    const student = await harness.joinAsStudent(summary.joinCode, 'Ada');

    const shownPromise = harness.nextEvent(student.socket, 'question:show');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    const shown = await shownPromise;
    await harness.waitUntil(shown.startsAtServerMs);
    await student.socket.emitWithAck('answer:submit', {
      questionId: shown.questionId,
      chosenIndex: question.correctIndex,
    });
    await sleep(150);
    await harness.engine.settlePersistence();
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(80);
    const before = snapshots.find((snapshot) => snapshot.questions.length > 0) as AnalyticsSnapshot;
    const final = snapshots[snapshots.length - 1] as AnalyticsSnapshot;
    return { quizId, question, before: before.questions[0], final: final.questions[0] };
  }

  it('flags a question with 29 responses as provisional and clears the flag when it reaches 30', async () => {
    const { before, final, question, quizId } = await answerSingleQuestion(29);
    expect(before).toMatchObject({ ratingAnswers: 29, provisional: true });
    expect(final).toMatchObject({ ratingAnswers: 30, provisional: false });
    expect(
      harness.repository.quizzes
        .get(quizId)
        ?.questions.find((candidate) => candidate.id === question.id)?.answersCount,
    ).toBe(30);
  });

  it('keeps a question with few responses provisional and counts every answer once', async () => {
    const { before, final } = await answerSingleQuestion(5);
    expect(before).toMatchObject({ ratingAnswers: 5, provisional: true });
    expect(final).toMatchObject({ ratingAnswers: 6, provisional: true });
  });
});
