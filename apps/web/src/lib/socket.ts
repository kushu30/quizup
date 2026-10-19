import type { ClientToServerEvents, ServerToClientEvents } from '@quizup/shared';
import { io, type Socket } from 'socket.io-client';
import { webEnv } from './env';

export type QuizSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createQuizSocket(accessToken?: string): QuizSocket {
  return io(webEnv.VITE_SERVER_URL, {
    transports: ['websocket'],
    auth: accessToken ? { accessToken } : {},
  });
}
