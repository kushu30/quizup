import {
  PROCTOR_CLIENT_QUEUE_LIMIT,
  type ProctorEventPayload,
  type ProctorSeriousType,
} from '@quizup/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaProctor } from '../../hooks/useMediaProctor';
import { releaseMedia } from '../../lib/proctorMedia/mediaStreamStore';
import { WARNING_REPEAT_MS } from '../../lib/proctorMedia/thresholds';
import type { QuizSocket } from '../../lib/socket';
import { ProctorIndicator } from './ProctorIndicator';
import { ProctorWarningBanner, type ProctorWarning } from './ProctorWarningBanner';

const RELEASE_DELAY_MS = 1000;
let pendingRelease: ReturnType<typeof setTimeout> | null = null;

interface MediaProctorLayerProps {
  socket: QuizSocket;
  room: { proctorCamera: boolean; proctorMic: boolean; proctorFlagLimit: number | null };
  /** True while the session (or the student's exam attempt) is running. */
  active: boolean;
  /** True once the student's seat is joined; flags wait here until then. */
  connected: boolean;
  now: () => number;
}

/**
 * Runs camera and microphone detection while a session is active, sends the flags to the server
 * and tells the student what is being watched and when something is flagged. The server decides
 * the count and any automatic submit; this only displays what it reports.
 */
export function MediaProctorLayer({
  socket,
  room,
  active,
  connected,
  now,
}: MediaProctorLayerProps) {
  const anyDevice = room.proctorCamera || room.proctorMic;
  // Flags raised while the connection is down wait here: the socket's own buffer would send them
  // before the seat is joined again, and the server would refuse them.
  const queueRef = useRef<ProctorEventPayload[]>([]);
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const send = useCallback(
    (event: ProctorEventPayload) => {
      if (connectedRef.current) {
        socket.emit('proctor:event', event, () => undefined);
        return;
      }
      const queue = queueRef.current;
      if (queue.length >= PROCTOR_CLIENT_QUEUE_LIMIT) {
        queue.shift();
      }
      queue.push(event);
    },
    [socket],
  );
  useEffect(() => {
    if (!connected) {
      return;
    }
    for (const event of queueRef.current.splice(0)) {
      socket.emit('proctor:event', event, () => undefined);
    }
  }, [connected, socket]);
  const devices = useMediaProctor({
    enabled: active && anyDevice,
    camera: room.proctorCamera,
    mic: room.proctorMic,
    send,
    now,
  });
  const [flags, setFlags] = useState<{ count: number; limit: number | null } | null>(null);
  const [warning, setWarning] = useState<ProctorWarning | null>(null);
  const lastShown = useRef(new Map<ProctorSeriousType, number>());
  const nextId = useRef(0);
  const nowRef = useRef(now);
  nowRef.current = now;

  // The camera and microphone go off once the session (or the student's attempt) is over. The
  // release waits a moment and a re-mount cancels it, because React in development mounts,
  // unmounts and re-mounts every component once, which would otherwise stop the stream the
  // pre-check just obtained and ask for permission again.
  useEffect(() => {
    if (pendingRelease) {
      clearTimeout(pendingRelease);
      pendingRelease = null;
    }
    return () => {
      pendingRelease = setTimeout(() => {
        pendingRelease = null;
        releaseMedia();
      }, RELEASE_DELAY_MS);
    };
  }, []);

  useEffect(() => {
    const handler = (payload: {
      count: number;
      limit: number | null;
      type: ProctorSeriousType;
    }) => {
      setFlags({ count: payload.count, limit: payload.limit });
      const final = payload.limit !== null && payload.count === payload.limit - 1;
      const at = nowRef.current();
      const last = lastShown.current.get(payload.type);
      if (!final && last !== undefined && at - last < WARNING_REPEAT_MS) {
        return;
      }
      lastShown.current.set(payload.type, at);
      nextId.current += 1;
      setWarning({
        id: nextId.current,
        type: payload.type,
        count: payload.count,
        limit: payload.limit,
      });
    };
    socket.on('proctor:flags', handler);
    return () => {
      socket.off('proctor:flags', handler);
    };
  }, [socket]);

  if (!anyDevice) {
    return null;
  }
  return (
    <div className="space-y-2">
      <ProctorIndicator
        camera={room.proctorCamera ? devices.camera : null}
        mic={room.proctorMic ? devices.mic : null}
        flags={flags}
      />
      <div data-testid="warning-slot" className="min-h-14">
        <ProctorWarningBanner warning={warning} />
      </div>
    </div>
  );
}
