import type { Server as HttpServer } from 'node:http';
import {
  PROCTOR_EVENT_RATE_PER_SECOND,
  answerSubmitPayloadSchema,
  examAnswerPayloadSchema,
  examEmptyPayloadSchema,
  examStartPayloadSchema,
  proctorEventPayloadSchema,
  roomJoinPayloadSchema,
  timePingPayloadSchema,
  type Ack,
  type ClientToServerEvents,
  type MeResponse,
  type ServerToClientEvents,
  type SocketErrorCode,
  feedbackSubmitPayloadSchema,
} from '@quizup/shared';
import { Server } from 'socket.io';
import type { z } from 'zod';
import type { AccessTokenVerifier } from './auth.js';
import { serverEnv } from './env.js';
import type { ExamService } from './exam/examService.js';
import type { LiveEngine } from './live/engine.js';
import type { SocketData, SocketPublisher } from './live/socketPublisher.js';
import { createRateLimiter } from './rateLimiter.js';
import { submitFeedback } from './feedback/feedback.js';

export type QuizSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const MAX_PAYLOAD_BYTES = 8 * 1024;
const RATE_WINDOW_MS = 10_000;
const MAX_PINGS_PER_WINDOW = 20;
const MAX_ANSWERS_PER_WINDOW = 10;
const MAX_JOINS_PER_WINDOW = 10;

type AckCallback = (response: Ack) => void;

function resolveAck(candidate: unknown): AckCallback {
  return typeof candidate === 'function' ? (candidate as AckCallback) : () => undefined;
}

function failure(error: SocketErrorCode): { ok: false; error: SocketErrorCode } {
  return { ok: false, error };
}

export interface SocketServerDependencies {
  engine: LiveEngine;
  exam: ExamService;
  publisher: SocketPublisher;
  verifier: AccessTokenVerifier;
  corsOrigins?: string[];
}

export function attachSocketServer(
  httpServer: HttpServer,
  dependencies: SocketServerDependencies,
): QuizSocketServer {
  const { engine, exam, publisher, verifier } = dependencies;
  const io: QuizSocketServer = new Server(httpServer, {
    cors: { origin: dependencies.corsOrigins ?? serverEnv.CORS_ORIGINS },
    maxHttpBufferSize: MAX_PAYLOAD_BYTES,
  });
  publisher.attach(io);

  io.use(async (socket, next) => {
    const accessToken: unknown = socket.handshake.auth['accessToken'];
    if (typeof accessToken === 'string' && accessToken.length > 0) {
      try {
        const authUser: MeResponse | null = await verifier.verify(accessToken);
        socket.data.authUser = authUser ?? undefined;
      } catch {
        socket.data.authUser = undefined;
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    const pingLimiter = createRateLimiter({
      maxEvents: MAX_PINGS_PER_WINDOW,
      windowMs: RATE_WINDOW_MS,
    });
    const answerLimiter = createRateLimiter({
      maxEvents: MAX_ANSWERS_PER_WINDOW,
      windowMs: RATE_WINDOW_MS,
    });
    const examLimiter = createRateLimiter({ maxEvents: 60, windowMs: RATE_WINDOW_MS });
    const proctorLimiter = createRateLimiter({
      maxEvents: PROCTOR_EVENT_RATE_PER_SECOND,
      windowMs: 1000,
    });
    const joinLimiter = createRateLimiter({
      maxEvents: MAX_JOINS_PER_WINDOW,
      windowMs: RATE_WINDOW_MS,
    });

    function handle<Schema extends z.ZodTypeAny>(
      schema: Schema,
      limiter: { allow: () => boolean },
      rawAck: unknown,
      run: (payload: z.output<Schema>, ack: (response: never) => void) => Promise<void> | void,
      rawPayload: unknown,
    ) {
      const ack = resolveAck(rawAck);
      if (!limiter.allow()) {
        ack(failure('rate_limited'));
        return;
      }
      const parsed = schema.safeParse(rawPayload);
      if (!parsed.success) {
        ack(failure('invalid_payload'));
        return;
      }
      Promise.resolve()
        .then(() => run(parsed.data, ack as (response: never) => void))
        .catch((error: unknown) => {
          console.error(error);
          ack(failure('server_error'));
        });
    }

    socket.on('time:ping', (rawPayload, rawAck) => {
      handle(
        timePingPayloadSchema,
        pingLimiter,
        rawAck,
        (payload, ack) => {
          socket.emit('time:pong', { clientSentMs: payload.clientSentMs, serverNowMs: Date.now() });
          (ack as AckCallback)({ ok: true });
        },
        rawPayload,
      );
    });

    socket.on('room:join', (rawPayload, rawAck) => {
      handle(
        roomJoinPayloadSchema,
        joinLimiter,
        rawAck,
        async (payload, ack) => {
          const respond = ack as (response: unknown) => void;

          if ('sessionId' in payload) {
            const authUser = socket.data.authUser;
            if (!authUser || (authUser.role !== 'host' && authUser.role !== 'admin')) {
              respond(failure('unauthorized'));
              return;
            }
            const authorization = engine.authorizeHost(payload.sessionId, authUser.id);
            if (!authorization.ok) {
              respond(authorization);
              return;
            }
            socket.data.role = 'host';
            socket.data.sessionId = payload.sessionId;
            publisher.bindHost(socket, payload.sessionId);
            respond({ ok: true, role: 'host', sessionId: payload.sessionId });
            const state = engine.getRoomState(payload.sessionId, { role: 'host' });
            if (state) {
              socket.emit('room:state', state);
            }
            const progress = exam.getProgressPayload(payload.sessionId);
            if (progress) {
              socket.emit('exam:progress', progress);
            }
            const snapshot = engine.getAnalyticsSnapshot(payload.sessionId, false);
            if (snapshot) {
              socket.emit('analytics:snapshot', snapshot);
            }
            return;
          }

          const joined = await engine.joinStudent(payload, {
            userId: socket.data.authUser?.id ?? null,
          });
          if (!joined.ok || joined.role !== 'student') {
            respond(joined);
            return;
          }
          socket.data.role = 'student';
          socket.data.sessionId = joined.sessionId;
          socket.data.participantId = joined.participantId;
          publisher.bindParticipant(socket, joined.sessionId, joined.participantId);
          engine.setParticipantConnected(joined.participantId, true);
          await exam.submitIfExpired(joined.participantId);
          respond(joined);
          const state = engine.getRoomState(joined.sessionId, {
            role: 'student',
            participantId: joined.participantId,
          });
          if (state) {
            socket.emit('room:state', state);
          }
        },
        rawPayload,
      );
    });

    socket.on('answer:submit', (rawPayload, rawAck) => {
      handle(
        answerSubmitPayloadSchema,
        answerLimiter,
        rawAck,
        async (payload, ack) => {
          const participantId = socket.data.participantId;
          if (socket.data.role !== 'student' || !participantId) {
            (ack as AckCallback)(failure('not_in_room'));
            return;
          }
          (ack as AckCallback)(await engine.submitAnswer(participantId, payload));
        },
        rawPayload,
      );
    });

    function studentParticipantId(): string | null {
      return socket.data.role === 'student' ? (socket.data.participantId ?? null) : null;
    }

    socket.on('exam:start', (rawPayload, rawAck) => {
      handle(
        examStartPayloadSchema,
        examLimiter,
        rawAck,
        async (payload, ack) => {
          const participantId = studentParticipantId();
          (ack as AckCallback)(
            participantId
              ? await exam.startAttempt(participantId, payload.consentVersion)
              : failure('not_in_room'),
          );
        },
        rawPayload,
      );
    });

    socket.on('exam:answer', (rawPayload, rawAck) => {
      handle(
        examAnswerPayloadSchema,
        examLimiter,
        rawAck,
        async (payload, ack) => {
          const participantId = studentParticipantId();
          (ack as AckCallback)(
            participantId ? await exam.saveAnswer(participantId, payload) : failure('not_in_room'),
          );
        },
        rawPayload,
      );
    });

    socket.on('feedback:submit', (rawPayload, rawAck) => {
      handle(
        feedbackSubmitPayloadSchema,
        examLimiter,
        rawAck,
        async (payload, ack) => {
          const participantId = studentParticipantId();
          (ack as AckCallback)(
            participantId
              ? await submitFeedback({ engine, exam }, participantId, payload)
              : failure('not_in_room'),
          );
        },
        rawPayload,
      );
    });

    socket.on('exam:submit', (rawPayload, rawAck) => {
      handle(
        examEmptyPayloadSchema,
        examLimiter,
        rawAck,
        async (_payload, ack) => {
          const participantId = studentParticipantId();
          (ack as AckCallback)(
            participantId ? await exam.submit(participantId, 'student') : failure('not_in_room'),
          );
        },
        rawPayload,
      );
    });

    socket.on('exam:results', (rawPayload, rawAck) => {
      handle(
        examEmptyPayloadSchema,
        examLimiter,
        rawAck,
        async (_payload, ack) => {
          const participantId = studentParticipantId();
          (ack as AckCallback)(
            participantId ? await exam.getResults(participantId) : failure('not_in_room'),
          );
        },
        rawPayload,
      );
    });

    socket.on('proctor:event', (rawPayload, rawAck) => {
      const ack = resolveAck(rawAck);
      const participantId = studentParticipantId();
      if (!participantId) {
        ack(failure('not_in_room'));
        return;
      }
      if (!proctorLimiter.allow()) {
        exam.recordDropped(participantId);
        ack(failure('rate_limited'));
        return;
      }
      const parsed = proctorEventPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        ack(failure('invalid_payload'));
        return;
      }
      exam
        .recordProctorEvent(participantId, parsed.data)
        .then((result) => ack(result))
        .catch((error: unknown) => {
          console.error(error);
          ack(failure('server_error'));
        });
    });

    socket.on('disconnect', () => {
      const participantId = socket.data.participantId;
      if (socket.data.role === 'student' && participantId) {
        if (publisher.unbindParticipant(participantId, socket.id)) {
          engine.setParticipantConnected(participantId, false);
        }
      }
    });
  });

  return io;
}
