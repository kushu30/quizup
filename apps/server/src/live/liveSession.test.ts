import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  ClientToServerEvents,
  MeResponse,
  ServerToClientEvents,
  SessionSummary,
} from '@quizup/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { AccessTokenVerifier } from '../auth.js';
import { attachSocketServer, type QuizSocketServer } from '../socket.js';
import { LiveEngine } from './engine.js';
import { InMemoryLiveRepository } from './inMemoryRepository.js';
import { SocketPublisher } from './socketPublisher.js';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
interface UntypedListenerSocket {
  once: (event: string, listener: (payload: unknown) => void) => void;
}
type EventPayload<Event extends keyof ServerToClientEvents> = Parameters<
  ServerToClientEvents[Event]
>[0];

const HOST: MeResponse = { id: randomUUID(), email: 'host@test.dev', name: 'Host', role: 'host' };
const OTHER_HOST: MeResponse = {
  id: randomUUID(),
  email: 'other@test.dev',
  name: 'Other',
  role: 'host',
};
const STUDENT_ACCOUNT: MeResponse = {
  id: randomUUID(),
  email: 'student@test.dev',
  name: 'Student',
  role: 'student',
};

const TOKENS: Record<string, MeResponse> = {
  'host-token': HOST,
  'other-host-token': OTHER_HOST,
  'student-token': STUDENT_ACCOUNT,
};

const verifier: AccessTokenVerifier = {
  verify: async (accessToken) => TOKENS[accessToken] ?? null,
};

const START_DELAY_MS = 150;
const GRACE_MS = 100;
const QUESTION_DURATION_MS = 400;

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('live session engine over sockets', () => {
  let repository: InMemoryLiveRepository;
  let engine: LiveEngine;
  let httpServer: HttpServer;
  let socketServer: QuizSocketServer;
  let baseUrl: string;
  let quizId: string;
  let openSockets: TestSocket[];
  const questions = [0, 1, 2].map((index) => ({
    id: randomUUID(),
    stem: `Question ${index}`,
    options: ['A', 'B', 'C', 'D'].map((letter) => `${letter}${index}`),
    correctIndex: index % 4,
  }));

  beforeEach(async () => {
    openSockets = [];
    repository = new InMemoryLiveRepository();
    quizId = repository.seedQuiz({ hostId: HOST.id, questions });
    const publisher = new SocketPublisher();
    engine = new LiveEngine({
      repository,
      publisher,
      startDelayMs: START_DELAY_MS,
      graceMs: GRACE_MS,
      hostRefreshIntervalMs: 20,
    });
    httpServer = createServer(createApp({ engine, verifier }));
    socketServer = attachSocketServer(httpServer, {
      engine,
      publisher,
      verifier,
      corsOrigins: ['http://localhost:5173'],
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const socket of openSockets) {
      socket.disconnect();
    }
    engine.shutdown();
    await new Promise<void>((resolve) => {
      void socketServer.close(() => resolve());
    });
  });

  async function connect(accessToken?: string): Promise<TestSocket> {
    const socket: TestSocket = createClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      auth: accessToken ? { accessToken } : {},
    });
    openSockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  function nextEvent<Event extends keyof ServerToClientEvents>(
    socket: TestSocket,
    event: Event,
    timeoutMs = 3000,
  ): Promise<EventPayload<Event>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${event}`)),
        timeoutMs,
      );
      (socket as unknown as UntypedListenerSocket).once(event, (payload) => {
        clearTimeout(timer);
        resolve(payload as EventPayload<Event>);
      });
    });
  }

  async function createLiveSession(questionDurationMs = QUESTION_DURATION_MS) {
    return engine.createSession({ quizId, hostId: HOST.id, questionDurationMs });
  }

  async function hostRequest(path: string, token = 'host-token', body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function joinAsStudent(joinCode: string, displayName: string) {
    const socket = await connect();
    const ack = await socket.emitWithAck('room:join', { joinCode, displayName });
    if (!ack.ok || ack.role !== 'student') {
      throw new Error(`Join failed for ${displayName}`);
    }
    return { socket, participantId: ack.participantId, rejoinToken: ack.rejoinToken };
  }

  async function joinAsHost(sessionId: string) {
    const socket = await connect('host-token');
    const ack = await socket.emitWithAck('room:join', { sessionId });
    expect(ack).toMatchObject({ ok: true, role: 'host' });
    return socket;
  }

  function correctIndexFor(questionId: string) {
    return questions.find((question) => question.id === questionId)?.correctIndex ?? -1;
  }

  async function waitUntilStarted(startsAtServerMs: number) {
    await sleep(Math.max(startsAtServerMs - Date.now() + 15, 0));
  }

  it('runs a question from join to results and leaderboard', async () => {
    const summary = await createLiveSession();
    const hostSocket = await joinAsHost(summary.session.id);
    const alice = await joinAsStudent(summary.joinCode, 'Alice');
    const bob = await joinAsStudent(summary.joinCode, 'Bob');

    const aliceShown = nextEvent(alice.socket, 'question:show');
    const bobShown = nextEvent(bob.socket, 'question:show');
    const startResponse = await hostRequest(`/sessions/${summary.session.id}/start`);
    expect(startResponse.status).toBe(200);
    const shown = await aliceShown;
    await bobShown;

    expect(Object.keys(shown).sort()).toEqual([
      'durationMs',
      'options',
      'questionId',
      'startsAtServerMs',
      'stem',
    ]);
    expect(shown.durationMs).toBe(QUESTION_DURATION_MS);
    expect(JSON.stringify(shown)).not.toMatch(/correct/i);

    const correct = correctIndexFor(shown.questionId);
    const wrong = (correct + 1) % 4;
    const aliceResult = nextEvent(alice.socket, 'question:result');
    const bobResult = nextEvent(bob.socket, 'question:result');
    const aliceBoard = nextEvent(alice.socket, 'leaderboard:update');
    const hostResult = nextEvent(hostSocket, 'question:result');

    await waitUntilStarted(shown.startsAtServerMs);
    expect(
      await alice.socket.emitWithAck('answer:submit', {
        questionId: shown.questionId,
        chosenIndex: correct,
      }),
    ).toEqual({ ok: true });
    expect(
      await bob.socket.emitWithAck('answer:submit', {
        questionId: shown.questionId,
        chosenIndex: wrong,
      }),
    ).toEqual({ ok: true });

    const aliceOutcome = await aliceResult;
    const bobOutcome = await bobResult;
    const hostOutcome = await hostResult;

    expect(aliceOutcome.correctIndex).toBe(correct);
    expect((aliceOutcome.optionCounts ?? []).reduce((total, count) => total + count, 0)).toBe(2);
    expect(aliceOutcome.you).toMatchObject({ correct: true, rank: 1, chosenIndex: correct });
    expect(aliceOutcome.you?.pointsAwarded).toBeGreaterThanOrEqual(500);
    expect(bobOutcome.you).toMatchObject({
      correct: false,
      pointsAwarded: 0,
      totalPoints: 0,
      rank: 2,
    });
    expect(hostOutcome.you).toBeNull();

    const board = await aliceBoard;
    expect(board.entries.map((entry) => entry.displayName)).toEqual(['Alice', 'Bob']);
    expect(board.you).toMatchObject({ rank: 1 });

    expect(repository.responses).toHaveLength(2);
    const aliceStored = repository.responses.find(
      (response) => response.participantId === alice.participantId,
    );
    expect(aliceStored).toMatchObject({ correct: true, chosenIndex: correct });
    expect(aliceStored?.points).toBe(aliceOutcome.you?.pointsAwarded);

    const ended = nextEvent(alice.socket, 'session:end');
    const endResponse = await hostRequest(`/sessions/${summary.session.id}/end`);
    expect(endResponse.status).toBe(200);
    const finalBoard = await ended;
    expect(finalBoard.entries[0]?.displayName).toBe('Alice');
    expect(repository.sessions.get(summary.session.id)?.session.status).toBe('ended');
  });

  it('rejects early, duplicate and late answers', async () => {
    const summary = await createLiveSession();
    const alice = await joinAsStudent(summary.joinCode, 'Alice');
    await joinAsStudent(summary.joinCode, 'Bob');

    const shownPromise = nextEvent(alice.socket, 'question:show');
    await hostRequest(`/sessions/${summary.session.id}/start`);
    const shown = await shownPromise;
    const submission = { questionId: shown.questionId, chosenIndex: 0 };

    expect(await alice.socket.emitWithAck('answer:submit', submission)).toEqual({
      ok: false,
      error: 'too_early',
    });

    await waitUntilStarted(shown.startsAtServerMs);
    expect(await alice.socket.emitWithAck('answer:submit', submission)).toEqual({ ok: true });
    expect(await alice.socket.emitWithAck('answer:submit', submission)).toEqual({
      ok: false,
      error: 'already_answered',
    });
    expect(repository.responses).toHaveLength(1);

    const bob = openSockets[openSockets.length - 1] as TestSocket;
    await sleep(shown.startsAtServerMs + QUESTION_DURATION_MS + GRACE_MS - Date.now() + 40);
    expect(await bob.emitWithAck('answer:submit', submission)).toEqual({
      ok: false,
      error: 'too_late',
    });
    expect(repository.responses).toHaveLength(1);
  });

  it('rejects an answer for a question that is not current', async () => {
    const summary = await createLiveSession();
    const alice = await joinAsStudent(summary.joinCode, 'Alice');
    const shownPromise = nextEvent(alice.socket, 'question:show');
    await hostRequest(`/sessions/${summary.session.id}/start`);
    await shownPromise;

    expect(
      await alice.socket.emitWithAck('answer:submit', { questionId: randomUUID(), chosenIndex: 0 }),
    ).toEqual({ ok: false, error: 'wrong_question' });
  });

  it('restores state for a student who reconnects mid-question', async () => {
    const summary = await createLiveSession(2000);
    const alice = await joinAsStudent(summary.joinCode, 'Alice');
    await joinAsStudent(summary.joinCode, 'Carol');

    const shownPromise = nextEvent(alice.socket, 'question:show');
    await hostRequest(`/sessions/${summary.session.id}/start`);
    const shown = await shownPromise;
    await waitUntilStarted(shown.startsAtServerMs);

    await alice.socket.emitWithAck('answer:submit', {
      questionId: shown.questionId,
      chosenIndex: 0,
    });
    alice.socket.disconnect();

    const returning = await connect();
    const statePromise = nextEvent(returning, 'room:state');
    const ack = await returning.emitWithAck('room:join', {
      joinCode: summary.joinCode,
      displayName: 'Alice',
      rejoinToken: alice.rejoinToken,
    });
    expect(ack).toMatchObject({ ok: true, participantId: alice.participantId });

    const state = await statePromise;
    expect(state.status).toBe('running');
    expect(state.role).toBe('student');
    expect(state.youAnswered).toBe(true);
    expect(state.questionClosed).toBe(false);
    expect(state.currentQuestion).toMatchObject({
      questionId: shown.questionId,
      startsAtServerMs: shown.startsAtServerMs,
      durationMs: shown.durationMs,
      questionNumber: 1,
      totalQuestions: 3,
    });
    expect(state.you?.displayName).toBe('Alice');
    expect(JSON.stringify(state)).not.toMatch(/correct/i);
  });

  it('rejects wrong rejoin tokens and duplicate names', async () => {
    const summary = await createLiveSession();
    await joinAsStudent(summary.joinCode, 'Alice');

    const intruder = await connect();
    expect(
      await intruder.emitWithAck('room:join', {
        joinCode: summary.joinCode,
        displayName: 'Alice',
        rejoinToken: 'f'.repeat(64),
      }),
    ).toEqual({ ok: false, error: 'invalid_rejoin_token' });
    expect(
      await intruder.emitWithAck('room:join', { joinCode: summary.joinCode, displayName: 'alice' }),
    ).toEqual({ ok: false, error: 'name_taken' });
    expect(
      await intruder.emitWithAck('room:join', { joinCode: 'ZZZZZZ', displayName: 'Zed' }),
    ).toEqual({ ok: false, error: 'session_not_found' });
  });

  it('only lets students join during the lobby', async () => {
    const summary = await createLiveSession();
    await joinAsStudent(summary.joinCode, 'Alice');
    await hostRequest(`/sessions/${summary.session.id}/start`);

    const lateComer = await connect();
    expect(
      await lateComer.emitWithAck('room:join', { joinCode: summary.joinCode, displayName: 'Late' }),
    ).toEqual({ ok: false, error: 'session_started' });
  });

  it('keeps host endpoints and host sockets away from non-owners', async () => {
    const quizResponse = await hostRequest('/sessions', 'student-token', {
      quizId,
      questionDurationSeconds: 10,
    });
    expect(quizResponse.status).toBe(403);
    expect((await hostRequest('/sessions', 'bad-token', { quizId })).status).toBe(401);

    const created = await hostRequest('/sessions', 'host-token', {
      quizId,
      questionDurationSeconds: 10,
    });
    expect(created.status).toBe(201);
    const summary = (await created.json()) as SessionSummary;
    expect(summary.joinCode).toHaveLength(6);
    expect(summary.questionCount).toBe(3);

    expect(
      (await hostRequest(`/sessions/${summary.session.id}/start`, 'student-token')).status,
    ).toBe(403);
    expect(
      (await hostRequest(`/sessions/${summary.session.id}/start`, 'other-host-token')).status,
    ).toBe(404);
    expect(
      (await hostRequest('/sessions', 'other-host-token', { quizId, questionDurationSeconds: 10 }))
        .status,
    ).toBe(404);
    expect(
      (await hostRequest('/sessions', 'host-token', { quizId, questionDurationSeconds: 2 })).status,
    ).toBe(400);

    const studentAccountSocket = await connect('student-token');
    expect(
      await studentAccountSocket.emitWithAck('room:join', { sessionId: summary.session.id }),
    ).toEqual({ ok: false, error: 'unauthorized' });

    const otherHostSocket = await connect('other-host-token');
    expect(
      await otherHostSocket.emitWithAck('room:join', { sessionId: summary.session.id }),
    ).toEqual({ ok: false, error: 'forbidden' });
  });

  it('refuses to start a session for a quiz without approved questions', async () => {
    const emptyQuizId = repository.seedQuiz({
      hostId: HOST.id,
      questions: [{ ...questions[0]!, id: randomUUID(), approved: false }],
    });
    const response = await hostRequest('/sessions', 'host-token', { quizId: emptyQuizId });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain('Approve at least one');
  });

  it('survives invalid payloads', async () => {
    const socket = await connect();
    const badJoin = await (socket as Socket).emitWithAck('room:join', { nope: true });
    expect(badJoin).toEqual({ ok: false, error: 'invalid_payload' });
    const badAnswer = await (socket as Socket).emitWithAck('answer:submit', 'garbage');
    expect(badAnswer).toEqual({ ok: false, error: 'invalid_payload' });
    (socket as Socket).emit('answer:submit', 42);
    expect(
      await socket.emitWithAck('answer:submit', { questionId: randomUUID(), chosenIndex: 1 }),
    ).toEqual({
      ok: false,
      error: 'not_in_room',
    });

    const pong = nextEvent(socket, 'time:pong');
    expect(await socket.emitWithAck('time:ping', { clientSentMs: 123 })).toEqual({ ok: true });
    expect((await pong).clientSentMs).toBe(123);
  });

  it('only serves approved questions', async () => {
    const approvedIds = [randomUUID(), randomUUID()];
    const mixedQuizId = repository.seedQuiz({
      hostId: HOST.id,
      questions: [
        {
          id: approvedIds[0] as string,
          stem: 'Approved one',
          options: ['a', 'b', 'c', 'd'],
          correctIndex: 0,
        },
        {
          id: randomUUID(),
          stem: 'Pending one',
          options: ['a', 'b', 'c', 'd'],
          correctIndex: 1,
          approved: false,
        },
        {
          id: approvedIds[1] as string,
          stem: 'Approved two',
          options: ['a', 'b', 'c', 'd'],
          correctIndex: 2,
        },
        {
          id: randomUUID(),
          stem: 'Pending two',
          options: ['a', 'b', 'c', 'd'],
          correctIndex: 3,
          approved: false,
        },
      ],
    });
    const summary = await engine.createSession({
      quizId: mixedQuizId,
      hostId: HOST.id,
      questionDurationMs: 300,
    });
    expect([...summary.session.question_ids].sort()).toEqual([...approvedIds].sort());
    expect(summary.questionCount).toBe(2);

    const alice = await joinAsStudent(summary.joinCode, 'Alice');
    const shownStems: string[] = [];
    let upcomingShow = nextEvent(alice.socket, 'question:show');
    await hostRequest(`/sessions/${summary.session.id}/start`);

    for (let round = 0; round < 2; round += 1) {
      const shown = await upcomingShow;
      shownStems.push(shown.stem);
      expect(approvedIds).toContain(shown.questionId);
      const result = nextEvent(alice.socket, 'question:result');
      await waitUntilStarted(shown.startsAtServerMs);
      await alice.socket.emitWithAck('answer:submit', {
        questionId: shown.questionId,
        chosenIndex: 0,
      });
      await result;
      upcomingShow = nextEvent(alice.socket, 'question:show');
      await hostRequest(`/sessions/${summary.session.id}/next`);
    }

    expect(shownStems.sort()).toEqual(['Approved one', 'Approved two']);
  });

  it('refuses to start when a question was unapproved after the session was created', async () => {
    const summary = await createLiveSession();
    const quiz = repository.quizzes.get(quizId);
    const target = quiz?.questions[0];
    if (!target) {
      throw new Error('seed missing');
    }
    target.approved = false;

    const response = await hostRequest(`/sessions/${summary.session.id}/start`);
    expect(response.status).toBe(409);
    expect(repository.sessions.get(summary.session.id)?.session.status).toBe('lobby');
  });

  it('picks up edits made between creating and starting the session', async () => {
    const summary = await createLiveSession();
    const alice = await joinAsStudent(summary.joinCode, 'Alice');
    const quiz = repository.quizzes.get(quizId);
    for (const question of quiz?.questions ?? []) {
      question.stem = `Edited ${question.stem}`;
    }

    const shownPromise = nextEvent(alice.socket, 'question:show');
    await hostRequest(`/sessions/${summary.session.id}/start`);
    expect((await shownPromise).stem.startsWith('Edited ')).toBe(true);
  });

  it('plays through every question and ends the session', async () => {
    const summary = await createLiveSession(300);
    const alice = await joinAsStudent(summary.joinCode, 'Alice');

    let upcomingShow = nextEvent(alice.socket, 'question:show');
    await hostRequest(`/sessions/${summary.session.id}/start`);
    const seenQuestionIds: string[] = [];

    for (let round = 0; round < 3; round += 1) {
      const shown = await upcomingShow;
      seenQuestionIds.push(shown.questionId);
      const result = nextEvent(alice.socket, 'question:result');
      await waitUntilStarted(shown.startsAtServerMs);
      await alice.socket.emitWithAck('answer:submit', {
        questionId: shown.questionId,
        chosenIndex: correctIndexFor(shown.questionId),
      });
      await result;

      upcomingShow = nextEvent(alice.socket, 'question:show');
      const ended = nextEvent(alice.socket, 'session:end');
      const nextResponse = await hostRequest(`/sessions/${summary.session.id}/next`);
      expect(nextResponse.status).toBe(200);
      if (round === 2) {
        const finalBoard = await ended;
        expect(finalBoard.entries[0]).toMatchObject({ displayName: 'Alice' });
        expect(finalBoard.you?.rank).toBe(1);
      }
    }

    expect(new Set(seenQuestionIds).size).toBe(3);
    expect(repository.sessions.get(summary.session.id)?.session.question_ids).toHaveLength(3);
    expect(repository.sessions.get(summary.session.id)?.session.status).toBe('ended');
    expect(repository.responses).toHaveLength(3);
  });
});
