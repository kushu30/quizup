import type { MeResponse, ServerToClientEvents } from '@quizup/shared';
import type { Socket } from 'socket.io';
import type { QuizSocketServer } from '../socket.js';
import type { EngineEventName, LivePublisher } from './types.js';

export interface SocketData {
  authUser?: MeResponse | undefined;
  role?: 'host' | 'student';
  sessionId?: string;
  participantId?: string;
}

function sessionRoom(sessionId: string) {
  return `session:${sessionId}`;
}

function hostRoom(sessionId: string) {
  return `host:${sessionId}`;
}

type AnyEmit = (event: string, ...args: unknown[]) => boolean;

export class SocketPublisher implements LivePublisher {
  private io: QuizSocketServer | null = null;
  private readonly socketIdByParticipantId = new Map<string, string>();

  attach(io: QuizSocketServer) {
    this.io = io;
  }

  bindHost(socket: Socket, sessionId: string) {
    void socket.join([sessionRoom(sessionId), hostRoom(sessionId)]);
  }

  bindParticipant(socket: Socket, sessionId: string, participantId: string) {
    const previousSocketId = this.socketIdByParticipantId.get(participantId);
    this.socketIdByParticipantId.set(participantId, socket.id);
    void socket.join(sessionRoom(sessionId));
    if (previousSocketId && previousSocketId !== socket.id) {
      this.io?.sockets.sockets.get(previousSocketId)?.disconnect(true);
    }
  }

  unbindParticipant(participantId: string, socketId: string): boolean {
    if (this.socketIdByParticipantId.get(participantId) !== socketId) {
      return false;
    }
    this.socketIdByParticipantId.delete(participantId);
    return true;
  }

  emitToSession<Event extends EngineEventName>(
    sessionId: string,
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) {
    const target = this.io?.to(sessionRoom(sessionId));
    (target?.emit as AnyEmit | undefined)?.call(target, event, ...args);
  }

  emitToHost<Event extends EngineEventName>(
    sessionId: string,
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) {
    const target = this.io?.to(hostRoom(sessionId));
    (target?.emit as AnyEmit | undefined)?.call(target, event, ...args);
  }

  emitToParticipant<Event extends EngineEventName>(
    participantId: string,
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) {
    const socketId = this.socketIdByParticipantId.get(participantId);
    if (!socketId) {
      return;
    }
    const target = this.io?.to(socketId);
    (target?.emit as AnyEmit | undefined)?.call(target, event, ...args);
  }
}
