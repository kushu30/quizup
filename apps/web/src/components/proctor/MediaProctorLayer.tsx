import type { ProctorEventPayload, ProctorSeriousType } from '@quizup/shared';
import { useEffect, useRef, useState } from 'react';
import { useMediaProctor } from '../../hooks/useMediaProctor';
import { WARNING_REPEAT_MS } from '../../lib/proctorMedia/thresholds';
import type { QuizSocket } from '../../lib/socket';
import { ProctorIndicator } from './ProctorIndicator';
import { ProctorWarningBanner, type ProctorWarning } from './ProctorWarningBanner';

interface MediaProctorLayerProps {
  socket: QuizSocket;
  room: { proctorCamera: boolean; proctorMic: boolean; proctorFlagLimit: number | null };
  /** True while the session (or the student's exam attempt) is running. */
  active: boolean;
  now: () => number;
}

/**
 * Runs camera and microphone detection while a session is active, sends the flags to the server
 * and tells the student what is being watched and when something is flagged. The server decides
 * the count and any automatic submit; this only displays what it reports.
 */
export function MediaProctorLayer({ socket, room, active, now }: MediaProctorLayerProps) {
  const anyDevice = room.proctorCamera || room.proctorMic;
  const devices = useMediaProctor({
    enabled: active && anyDevice,
    camera: room.proctorCamera,
    mic: room.proctorMic,
    send: (event: ProctorEventPayload) => socket.emit('proctor:event', event, () => undefined),
    now,
  });
  const [flags, setFlags] = useState<{ count: number; limit: number | null } | null>(null);
  const [warning, setWarning] = useState<ProctorWarning | null>(null);
  const lastShown = useRef(new Map<ProctorSeriousType, number>());
  const nextId = useRef(0);
  const nowRef = useRef(now);
  nowRef.current = now;

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
      <ProctorWarningBanner warning={warning} />
    </div>
  );
}
