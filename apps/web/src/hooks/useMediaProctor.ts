import type { ProctorEventPayload, ProctorSeriousType } from '@quizup/shared';
import { useEffect, useRef, useState } from 'react';
import { createAudioMeter } from '../lib/proctorMedia/audioMeter';
import { createLoudnessDetector } from '../lib/proctorMedia/audioLevel';
import { createEpisodeTracker } from '../lib/proctorMedia/episodes';
import { createFaceSampler } from '../lib/proctorMedia/faceSampler';
import { classifyFrame } from '../lib/proctorMedia/frameAnalysis';
import { acquireMedia, type DeviceState } from '../lib/proctorMedia/mediaStreamStore';
import {
  AUDIO_INTERVAL_MS,
  CAMERA_BLOCKED_HOLD_MS,
  EPISODE_CONTINUE_MS,
  EPISODE_COOLDOWN_MS,
  FACE_MISSING_HOLD_MS,
  FRAME_INTERVAL_MS,
  LOOKING_AWAY_HOLD_MS,
  LOUD_AUDIO_HOLD_MS,
  MULTIPLE_FACES_HOLD_MS,
} from '../lib/proctorMedia/thresholds';

interface UseMediaProctorOptions {
  enabled: boolean;
  camera: boolean;
  mic: boolean;
  send: (event: ProctorEventPayload) => void;
  /** Synchronised clock, so event times line up with the server. */
  now: () => number;
}

interface UseMediaProctorResult {
  camera: DeviceState | null;
  mic: DeviceState | null;
}

function tracker(holdMs: number) {
  return createEpisodeTracker({
    holdMs,
    continueMs: EPISODE_CONTINUE_MS,
    cooldownMs: EPISODE_COOLDOWN_MS,
  });
}

/**
 * Watches the camera and microphone on the student's device and reports flags as proctor events.
 * Nothing is recorded or sent except the type and time of a flag. A refused, missing or failing
 * device is logged once and never stops the student.
 */
export function useMediaProctor(options: UseMediaProctorOptions): UseMediaProctorResult {
  const { enabled, camera, mic } = options;
  const sendRef = useRef(options.send);
  const nowRef = useRef(options.now);
  sendRef.current = options.send;
  nowRef.current = options.now;
  const [devices, setDevices] = useState<UseMediaProctorResult>({ camera: null, mic: null });

  useEffect(() => {
    if (!enabled || (!camera && !mic)) {
      return;
    }
    let cancelled = false;
    const cleanups: (() => void)[] = [];

    const emit = (type: ProctorEventPayload['type'], continued?: boolean) => {
      const event =
        continued === undefined
          ? { type, clientAt: nowRef.current() }
          : { type, clientAt: nowRef.current(), detail: { continued } };
      sendRef.current(event as ProctorEventPayload);
    };
    const setDevice = (device: 'camera' | 'mic', state: DeviceState) =>
      setDevices((current) => ({ ...current, [device]: state }));
    const raise = (type: ProctorSeriousType, signal: 'none' | 'start' | 'continue') => {
      if (signal !== 'none') {
        emit(type, signal === 'continue');
      }
    };

    void (async () => {
      const access = await acquireMedia({ camera, mic });
      if (cancelled) {
        return;
      }
      setDevices({ camera: access.camera, mic: access.mic });
      if (camera && access.camera !== 'ready') {
        emit('camera_denied');
      }
      if (mic && access.mic !== 'ready') {
        emit('mic_denied');
      }
      const stream = access.stream;
      if (!stream) {
        return;
      }

      const watchEnded = (device: 'camera' | 'mic', lostType: 'camera_lost' | 'mic_lost') => {
        const tracks = device === 'camera' ? stream.getVideoTracks() : stream.getAudioTracks();
        let reported = false;
        tracks[0]?.addEventListener('ended', () => {
          if (cancelled || reported) {
            return;
          }
          reported = true;
          setDevice(device, 'lost');
          emit(lostType);
        });
      };

      if (camera && access.camera === 'ready') {
        watchEnded('camera', 'camera_lost');
        const sampler = await createFaceSampler(stream).catch(() => null);
        if (cancelled) {
          sampler?.stop();
          return;
        }
        if (!sampler) {
          setDevice('camera', 'missing');
          emit('camera_denied');
        } else {
          const missing = tracker(FACE_MISSING_HOLD_MS);
          const several = tracker(MULTIPLE_FACES_HOLD_MS);
          const away = tracker(LOOKING_AWAY_HOLD_MS);
          const blocked = tracker(CAMERA_BLOCKED_HOLD_MS);
          const timer = setInterval(() => {
            const at = nowRef.current();
            // A hidden tab is already reported as a tab switch; judging the camera then would
            // only add false flags, and returning must not count the time spent away.
            const sample = document.hidden ? null : sampler.sample();
            if (!sample) {
              if (document.hidden) {
                for (const each of [missing, several, away, blocked]) {
                  each.update(false, at);
                }
              }
              return;
            }
            const frame = classifyFrame(sample);
            raise('camera_blocked', blocked.update(frame.blocked, at));
            raise('face_missing', missing.update(!frame.blocked && frame.faceCount === 0, at));
            raise('multiple_faces', several.update(frame.faceCount >= 2, at));
            raise('looking_away', away.update(frame.turnedAway, at));
          }, FRAME_INTERVAL_MS);
          cleanups.push(() => {
            clearInterval(timer);
            sampler.stop();
          });
        }
      }

      if (mic && access.mic === 'ready') {
        watchEnded('mic', 'mic_lost');
        const meter = createAudioMeter(stream);
        if (!meter) {
          setDevice('mic', 'missing');
          emit('mic_denied');
        } else {
          const detector = createLoudnessDetector();
          const loud = tracker(LOUD_AUDIO_HOLD_MS);
          const timer = setInterval(() => {
            const at = nowRef.current();
            const level = meter.read();
            const isLoud = detector.push(level, at);
            raise('loud_audio', loud.update(isLoud && !document.hidden, at));
          }, AUDIO_INTERVAL_MS);
          cleanups.push(() => {
            clearInterval(timer);
            meter.stop();
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [enabled, camera, mic]);

  return devices;
}
