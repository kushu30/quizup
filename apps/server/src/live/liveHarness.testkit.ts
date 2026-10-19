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
import { createApp } from '../app.js';
import type { AccessTokenVerifier } from '../auth.js';
import { attachSocketServer, type QuizSocketServer } from '../socket.js';
import { LiveEngine, type LiveEngineOptions } from './engine.js';
import { InMemoryLiveRepository } from './inMemoryRepository.js';
import { SocketPublisher } from './socketPublisher.js';

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type EventPayload<Event extends keyof ServerToClientEvents> = Parameters<
  ServerToClientEvents[Event]
>[0];

interface UntypedListenerSocket {
  once: (event: string, listener: (payload: unknown) => void) => void;
  on: (event: string, listener: (payload: unknown) => void) => void;
}

export const TEST_HOST: MeResponse = {
  id: randomUUID(),
  email: 'host@test.dev',
  name: 'Host',
  role: 'host',
};

export const OTHER_HOST: MeResponse = {
  id: randomUUID(),
  email: 'other@test.dev',
  name: 'Other',
  role: 'host',
};
export const STUDENT_ACCOUNT: MeResponse = {
  id: randomUUID(),
  email: 'student@test.dev',
  name: 'Student',
  role: 'student',
};
export const ADMIN_ACCOUNT: MeResponse = {
  id: randomUUID(),
  email: 'admin@test.dev',
  name: 'Admin',
  role: 'admin',
};

const TOKEN_USERS: Record<string, MeResponse> = {
  'host-token': TEST_HOST,
  'other-host-token': OTHER_HOST,
  'student-token': STUDENT_ACCOUNT,
  'admin-token': ADMIN_ACCOUNT,
};

const verifier: AccessTokenVerifier = {
  verify: async (accessToken) => TOKEN_USERS[accessToken] ?? null,
};

export function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function startLiveHarness(engineOptions: Partial<LiveEngineOptions> = {}) {
  const repository = new InMemoryLiveRepository();
  const publisher = new SocketPublisher();
  const engine = new LiveEngine({
    repository,
    publisher,
    startDelayMs: 120,
    graceMs: 100,
    hostRefreshIntervalMs: 20,
    ...engineOptions,
  });
  const httpServer: HttpServer = createServer(createApp({ engine, verifier }));
  const socketServer: QuizSocketServer = attachSocketServer(httpServer, {
    engine,
    publisher,
    verifier,
    corsOrigins: ['http://localhost:5173'],
  });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  const openSockets: TestSocket[] = [];

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
    timeoutMs = 4000,
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

  function collectEvents<Event extends keyof ServerToClientEvents>(
    socket: TestSocket,
    event: Event,
  ): EventPayload<Event>[] {
    const collected: EventPayload<Event>[] = [];
    (socket as unknown as UntypedListenerSocket).on(event, (payload) => {
      collected.push(payload as EventPayload<Event>);
    });
    return collected;
  }

  async function hostRequest(path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer host-token', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function request(path: string, token = 'host-token', method = 'GET') {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
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
    if (!ack.ok) {
      throw new Error('Host join failed');
    }
    return socket;
  }

  async function createSession(
    quizId: string,
    questionDurationMs: number,
  ): Promise<SessionSummary> {
    return engine.createSession({ quizId, hostId: TEST_HOST.id, questionDurationMs });
  }

  async function waitUntil(serverMs: number) {
    await sleep(Math.max(serverMs - Date.now() + 15, 0));
  }

  async function close() {
    for (const socket of openSockets) {
      socket.disconnect();
    }
    engine.shutdown();
    await new Promise<void>((resolve) => {
      void socketServer.close(() => resolve());
    });
  }

  return {
    repository,
    engine,
    baseUrl,
    connect,
    nextEvent,
    collectEvents,
    hostRequest,
    request,
    joinAsStudent,
    joinAsHost,
    createSession,
    waitUntil,
    close,
  };
}
