import { randomUUID } from 'node:crypto';
import { createSeededRandom, type QuestionShowPayload } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_HOST, startLiveHarness, type TestSocket } from './liveHarness.testkit.js';
import type { SeedQuestion } from './inMemoryRepository.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

const DURATIONS_MS = 400;
const FIXED_RESPONSE_MS = 200;
const TOPICS = [' Algebra', 'geometry ', 'STATS'];
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

function buildPool(): SeedQuestion[] {
  const pool: SeedQuestion[] = [];
  TOPICS.forEach((topic, topicIndex) => {
    DIFFICULTIES.forEach((difficulty, difficultyIndex) => {
      pool.push({
        id: randomUUID(),
        stem: `${topic.trim()} ${difficulty}`,
        options: ['a', 'b', 'c', 'd'],
        correctIndex: (topicIndex + difficultyIndex) % 4,
        topic,
        difficulty,
      });
    });
  });
  return pool;
}

describe('adaptive and rating behaviour of live sessions', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  function correctIndexOf(questions: SeedQuestion[], questionId: string): number {
    return questions.find((question) => question.id === questionId)?.correctIndex ?? -1;
  }

  async function playRound(options: {
    sessionId: string;
    questions: SeedQuestion[];
    advanceClockTo?: (serverMs: number) => void;
    students: {
      name: string;
      socket: TestSocket;
      shown: Promise<QuestionShowPayload>;
      correct: boolean;
    }[];
  }) {
    const shownEvents = await Promise.all(options.students.map((student) => student.shown));
    const results = options.students.map((student) =>
      harness.nextEvent(student.socket, 'question:result'),
    );
    const roundStartsAt = Math.max(...shownEvents.map((shown) => shown.startsAtServerMs));
    if (options.advanceClockTo) {
      options.advanceClockTo(roundStartsAt + FIXED_RESPONSE_MS);
    } else {
      await harness.waitUntil(roundStartsAt);
    }
    await Promise.all(
      options.students.map(async (student, position) => {
        const shown = shownEvents[position] as QuestionShowPayload;
        const correctIndex = correctIndexOf(options.questions, shown.questionId);
        const ack = await student.socket.emitWithAck('answer:submit', {
          questionId: shown.questionId,
          chosenIndex: student.correct ? correctIndex : (correctIndex + 1) % 4,
        });
        expect(ack).toEqual({ ok: true });
      }),
    );
    const resolved = await Promise.all(results);
    await harness.engine.settlePersistence();
    return { shownEvents, results: resolved };
  }

  it('gives each student their own questions, never repeats, and updates ratings and mastery', async () => {
    let fakeNowMs = Date.now();
    harness = await startLiveHarness({
      random: createSeededRandom(5),
      now: () => fakeNowMs,
    });
    const pool = buildPool();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings: { adaptive: true, adaptiveRounds: 4 },
      questions: pool,
    });
    const summary = await harness.createSession(quizId, DURATIONS_MS);
    expect(summary.adaptive).toBe(true);
    expect(summary.questionCount).toBe(4);

    const hostSocket = await harness.joinAsHost(summary.session.id);
    const hostStates = harness.collectEvents(hostSocket, 'room:state');
    const alice = await harness.joinAsStudent(summary.joinCode, 'Alice');
    const bob = await harness.joinAsStudent(summary.joinCode, 'Bob');
    const aliceShows = harness.collectEvents(alice.socket, 'question:show');
    const bobShows = harness.collectEvents(bob.socket, 'question:show');

    let aliceNext = harness.nextEvent(alice.socket, 'question:show');
    let bobNext = harness.nextEvent(bob.socket, 'question:show');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);

    const roundResults = [];
    for (let round = 0; round < 4; round += 1) {
      const played = await playRound({
        sessionId: summary.session.id,
        questions: pool,
        advanceClockTo: (serverMs) => {
          fakeNowMs = serverMs;
        },
        students: [
          { name: 'Alice', socket: alice.socket, shown: aliceNext, correct: true },
          { name: 'Bob', socket: bob.socket, shown: bobNext, correct: false },
        ],
      });
      roundResults.push(played);
      aliceNext = harness.nextEvent(alice.socket, 'question:show');
      bobNext = harness.nextEvent(bob.socket, 'question:show');
      await harness.hostRequest(`/sessions/${summary.session.id}/next`);
    }
    await harness.engine.settlePersistence();

    const aliceIds = aliceShows.slice(0, 4).map((shown) => shown.questionId);
    const bobIds = bobShows.slice(0, 4).map((shown) => shown.questionId);
    expect(new Set(aliceIds).size).toBe(4);
    expect(new Set(bobIds).size).toBe(4);
    expect(aliceIds).not.toEqual(bobIds);

    for (const shown of [...aliceShows, ...bobShows]) {
      expect(Object.keys(shown).sort()).toEqual([
        'durationMs',
        'options',
        'questionId',
        'startsAtServerMs',
        'stem',
      ]);
      expect(JSON.stringify(shown)).not.toMatch(/correct/i);
    }

    const firstRound = roundResults[0];
    const aliceFirstResult = firstRound?.results[0];
    expect(aliceFirstResult?.optionCounts).toBeNull();
    expect(aliceFirstResult?.you).toMatchObject({ correct: true });
    expect(aliceFirstResult?.correctIndex).toBe(correctIndexOf(pool, aliceIds[0] as string));

    const aliceRow = harness.repository.participants.find(
      (participant) => participant.id === alice.participantId,
    );
    const bobRow = harness.repository.participants.find(
      (participant) => participant.id === bob.participantId,
    );
    expect(aliceRow?.elo).toBeGreaterThan(1000);
    expect(bobRow?.elo).toBeLessThan(1000);

    const aliceTopics = new Set(
      aliceIds.map((id) =>
        pool
          .find((question) => question.id === id)
          ?.topic?.trim()
          .toLowerCase(),
      ),
    );
    const aliceStates = harness.repository.knowledgeStates.filter(
      (state) => state.participantId === alice.participantId,
    );
    expect(aliceStates).toHaveLength(aliceTopics.size);
    for (const state of aliceStates) {
      expect(state.topic).toBe(state.topic.trim().toLowerCase());
      expect(state.pMastery).toBeGreaterThan(0.3);
      expect(state.pMastery).toBeLessThan(1);
    }
    const bobStates = harness.repository.knowledgeStates.filter(
      (state) => state.participantId === bob.participantId,
    );
    expect(bobStates.length).toBeGreaterThan(0);
    for (const state of bobStates) {
      expect(state.pMastery).toBeLessThan(0.3);
      expect(state.pMastery).toBeGreaterThan(0);
    }

    const aliceResponses = harness.repository.responses.filter(
      (response) => response.participantId === alice.participantId,
    );
    expect(aliceResponses).toHaveLength(4);
    for (const response of aliceResponses) {
      expect(response.participantEloBefore).toBeDefined();
      expect(response.questionEloBefore).toBeDefined();
    }
    expect(aliceResponses[0]?.participantEloBefore).toBe(1000);
    const initialRatings = { easy: 800, medium: 1000, hard: 1200 };
    const bobServed = new Set(bobIds);
    const aliceSolo = aliceIds.filter((id) => !bobServed.has(id));
    const aliceServed = new Set(aliceIds);
    const bobSolo = bobIds.filter((id) => !aliceServed.has(id));
    expect(aliceSolo.length + bobSolo.length).toBeGreaterThan(0);
    const storedQuestions = harness.repository.quizzes.get(quizId)?.questions ?? [];
    for (const id of aliceSolo) {
      const question = storedQuestions.find((candidate) => candidate.id === id);
      expect(question?.eloRating).toBeLessThan(initialRatings[question?.difficulty ?? 'medium']);
    }
    for (const id of bobSolo) {
      const question = storedQuestions.find((candidate) => candidate.id === id);
      expect(question?.eloRating).toBeGreaterThan(initialRatings[question?.difficulty ?? 'medium']);
    }
    const firstServed = storedQuestions.find((question) => question.id === aliceIds[0]);
    expect(aliceResponses[0]?.questionEloBefore).toBe(
      initialRatings[firstServed?.difficulty ?? 'medium'],
    );

    const hostWithTable = hostStates.filter((state) => state.adaptiveTable !== null);
    const latest = hostWithTable[hostWithTable.length - 1];
    expect(latest?.adaptive).toBe(true);
    expect(latest?.adaptiveTable?.map((row) => row.displayName).sort()).toEqual(['Alice', 'Bob']);
    expect(hostStates.some((state) => state.round !== null)).toBe(true);
    const lastAliceRow = latest?.adaptiveTable?.find((row) => row.displayName === 'Alice');
    expect(lastAliceRow?.lastCorrect).toBe(true);
    expect(lastAliceRow?.lastDifficulty).not.toBeNull();
  });

  it('restores a reconnecting student to their own current question', async () => {
    harness = await startLiveHarness({ random: createSeededRandom(11) });
    const pool = buildPool();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings: { adaptive: true, adaptiveRounds: 3 },
      questions: pool,
    });
    const summary = await harness.createSession(quizId, 2000);
    const alice = await harness.joinAsStudent(summary.joinCode, 'Alice');
    await harness.joinAsStudent(summary.joinCode, 'Bob');

    const shownPromise = harness.nextEvent(alice.socket, 'question:show');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    const shown = await shownPromise;
    alice.socket.disconnect();

    const returning = await harness.connect();
    const statePromise = harness.nextEvent(returning, 'room:state');
    const ack = await returning.emitWithAck('room:join', {
      joinCode: summary.joinCode,
      displayName: 'Alice',
      rejoinToken: alice.rejoinToken,
    });
    expect(ack).toMatchObject({ ok: true, participantId: alice.participantId });
    const state = await statePromise;

    expect(state.currentQuestion?.questionId).toBe(shown.questionId);
    expect(state.currentQuestion?.startsAtServerMs).toBe(shown.startsAtServerMs);
    expect(state.currentQuestion?.totalQuestions).toBe(3);
    expect(state.adaptiveTable).toBeNull();
    expect(state.round).toBeNull();
    expect(JSON.stringify(state)).not.toMatch(/correct_?index|rating/i);
  });

  it('updates ratings and mastery in non-adaptive sessions too and keeps one shared question', async () => {
    harness = await startLiveHarness();
    const pool = buildPool().slice(0, 3);
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool });
    const summary = await harness.createSession(quizId, DURATIONS_MS);
    expect(summary.adaptive).toBe(false);

    const alice = await harness.joinAsStudent(summary.joinCode, 'Alice');
    const bob = await harness.joinAsStudent(summary.joinCode, 'Bob');
    const aliceShown = harness.nextEvent(alice.socket, 'question:show');
    const bobShown = harness.nextEvent(bob.socket, 'question:show');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    expect((await aliceShown).questionId).toBe((await bobShown).questionId);

    const played = await playRound({
      sessionId: summary.session.id,
      questions: pool,
      students: [
        { name: 'Alice', socket: alice.socket, shown: aliceShown, correct: true },
        { name: 'Bob', socket: bob.socket, shown: bobShown, correct: false },
      ],
    });
    expect(played.results[0]?.optionCounts).toHaveLength(4);

    const rows = harness.repository.participants;
    expect(rows.find((row) => row.id === alice.participantId)?.elo).toBeGreaterThan(1000);
    expect(rows.find((row) => row.id === bob.participantId)?.elo).toBeLessThan(1000);
    expect(harness.repository.knowledgeStates).toHaveLength(2);
    for (const response of harness.repository.responses) {
      expect(response.participantEloBefore).toBe(1000);
      expect(response.questionEloBefore).toBeDefined();
    }
  });

  it('gives no rating or mastery update when nobody answers', async () => {
    harness = await startLiveHarness();
    const pool = buildPool().slice(0, 2);
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool });
    const summary = await harness.createSession(quizId, 250);
    const alice = await harness.joinAsStudent(summary.joinCode, 'Alice');

    const resultPromise = harness.nextEvent(alice.socket, 'question:result');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    const result = await resultPromise;
    await harness.engine.settlePersistence();

    expect(result.you).toMatchObject({ chosenIndex: null, correct: false, pointsAwarded: 0 });
    expect(harness.repository.participants[0]?.elo).toBe(1000);
    expect(harness.repository.knowledgeStates).toHaveLength(0);
    expect(harness.repository.responses).toHaveLength(0);
  });

  it('resolves rounds as min(requested or 10, approved count)', async () => {
    harness = await startLiveHarness();
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: randomUUID(),
      stem: `Q${index}`,
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
    }));
    const defaultRounds = await harness.createSession(
      harness.repository.seedQuiz({
        hostId: TEST_HOST.id,
        settings: { adaptive: true },
        questions: many,
      }),
      DURATIONS_MS,
    );
    expect(defaultRounds.questionCount).toBe(10);

    const capped = await harness.createSession(
      harness.repository.seedQuiz({
        hostId: TEST_HOST.id,
        settings: { adaptive: true, adaptiveRounds: 40 },
        questions: many,
      }),
      DURATIONS_MS,
    );
    expect(capped.questionCount).toBe(12);

    const few = await harness.createSession(
      harness.repository.seedQuiz({
        hostId: TEST_HOST.id,
        settings: { adaptive: true },
        questions: many.slice(0, 3),
      }),
      DURATIONS_MS,
    );
    expect(few.questionCount).toBe(3);

    const invalidSettings = await harness.createSession(
      harness.repository.seedQuiz({
        hostId: TEST_HOST.id,
        settings: { adaptive: 'yes' },
        questions: many.slice(0, 3),
      }),
      DURATIONS_MS,
    );
    expect(invalidSettings.adaptive).toBe(false);
  });
});
