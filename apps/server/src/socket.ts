import type { Server as HttpServer } from 'node:http';
import {
  timePingPayloadSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@quizup/shared';
import { Server } from 'socket.io';
import { serverEnv } from './env.js';

export type QuizSocketServer = Server<ClientToServerEvents, ServerToClientEvents>;

export function attachSocketServer(httpServer: HttpServer): QuizSocketServer {
  const io: QuizSocketServer = new Server(httpServer, {
    cors: { origin: serverEnv.CORS_ORIGINS },
  });

  io.on('connection', (socket) => {
    socket.on('time:ping', (payload) => {
      const parsed = timePingPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      socket.emit('time:pong', {
        clientSentMs: parsed.data.clientSentMs,
        serverMs: Date.now(),
      });
    });
  });

  return io;
}
