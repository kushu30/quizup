import { useEffect, useRef, useState } from 'react';
import { createAudioMeter } from '../../lib/proctorMedia/audioMeter';
import {
  acquireMedia,
  type DeviceState,
  type MediaAccess,
} from '../../lib/proctorMedia/mediaStreamStore';
import { ctaPrimary, ctaSize } from '../landing/cta';
import { CARD, PlayStage } from '../play/PlayStage';
import { Badge, type BadgeTone } from '../ui';

interface ProctorPrecheckProps {
  camera: boolean;
  mic: boolean;
  onContinue: () => void;
}

const LEVEL_POLL_MS = 100;
/** Speech is usually well below full scale; this stretches it across the bar. */
const LEVEL_GAIN = 250;

const STATE_BADGES: Record<DeviceState, { label: string; tone: BadgeTone }> = {
  ready: { label: 'Ready', tone: 'success' },
  denied: { label: 'Blocked', tone: 'warning' },
  missing: { label: 'Not found', tone: 'neutral' },
  lost: { label: 'Lost', tone: 'warning' },
};

function titleFor(camera: boolean, mic: boolean): string {
  if (camera && mic) {
    return 'Check your camera and microphone';
  }
  return camera ? 'Check your camera' : 'Check your microphone';
}

function DeviceRow({ label, state }: { label: string; state: DeviceState | null | 'checking' }) {
  const badge = state === 'checking' || state === null ? null : STATE_BADGES[state];
  return (
    <li className="flex items-center justify-between gap-3 rounded-[0.8rem] bg-white px-3.5 py-2.5 shadow-[0_0_0_1px_rgba(17,16,20,0.11)]">
      <span className="font-medium">{label}</span>
      <Badge tone={badge?.tone ?? 'neutral'}>{badge?.label ?? 'Checking'}</Badge>
    </li>
  );
}

/**
 * Shown before the session starts when the host turned the camera or microphone on. It asks for
 * permission and shows the student what the device sees and hears, locally only. Continue always
 * works: a refused device is simply reported to the host.
 */
export function ProctorPrecheck({ camera, mic, onContinue }: ProctorPrecheckProps) {
  const [access, setAccess] = useState<MediaAccess | null>(null);
  const [level, setLevel] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    void acquireMedia({ camera, mic }).then((result) => {
      if (!cancelled) {
        setAccess(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [camera, mic]);

  const stream = access?.stream ?? null;
  const cameraReady = access?.camera === 'ready' && stream !== null;
  const micReady = access?.mic === 'ready' && stream !== null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream || !cameraReady) {
      return;
    }
    video.srcObject = new MediaStream(stream.getVideoTracks());
    return () => {
      video.srcObject = null;
    };
  }, [stream, cameraReady]);

  useEffect(() => {
    if (!stream || !micReady) {
      return;
    }
    const meter = createAudioMeter(stream);
    if (!meter) {
      return;
    }
    const timer = setInterval(() => {
      setLevel(Math.min(100, Math.round(meter.read() * LEVEL_GAIN)));
    }, LEVEL_POLL_MS);
    return () => {
      clearInterval(timer);
      meter.stop();
    };
  }, [stream, micReady]);

  const anyBlocked =
    access !== null && ((camera && access.camera !== 'ready') || (mic && access.mic !== 'ready'));

  return (
    <PlayStage width="md">
      <div className={`${CARD} space-y-6 p-6 sm:p-8`}>
        <div className="space-y-2">
          <h1 className="text-[1.75rem] leading-tight font-medium tracking-[-0.03em]">
            {titleFor(camera, mic)}
          </h1>
          <p className="text-night/60">
            Your host turned this on for the session. It runs on your device, and nothing is
            recorded or sent. Your host only sees flags such as &ldquo;no face in view&rdquo;, with
            the time they happened.
          </p>
        </div>

        {cameraReady && (
          <video
            ref={videoRef}
            data-testid="self-view"
            muted
            playsInline
            autoPlay
            aria-label="What your camera sees. This preview stays on your device."
            className="aspect-[4/3] w-full rounded-[0.8rem] bg-night object-cover shadow-[0_0_0_1px_rgba(17,16,20,0.15)] [transform:scaleX(-1)]"
          />
        )}

        <ul className="space-y-2.5">
          {camera && <DeviceRow label="Camera" state={access ? access.camera : 'checking'} />}
          {mic && <DeviceRow label="Microphone" state={access ? access.mic : 'checking'} />}
        </ul>

        {micReady && (
          <div className="space-y-1.5">
            <p className="text-sm text-night/60">Say something to see the level move.</p>
            <div
              role="meter"
              aria-label="Microphone level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={level}
              className="h-2.5 w-full overflow-hidden rounded-full bg-night/[0.08]"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-400 transition-[width] duration-100"
                style={{ width: `${level}%` }}
              />
            </div>
          </div>
        )}

        {anyBlocked && (
          <p className="text-sm text-night/60">
            Your host will see that a device was blocked or not found. To fix it, allow access in
            your browser&rsquo;s address bar and reload this page, or continue without it.
          </p>
        )}

        <button type="button" onClick={onContinue} className={`${ctaPrimary} ${ctaSize.lg} w-full`}>
          Continue
        </button>
      </div>
    </PlayStage>
  );
}
