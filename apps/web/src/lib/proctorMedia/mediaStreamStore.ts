// One shared camera/microphone stream per page, so the permission asked on the pre-check screen
// is the one the detection uses afterwards (no second prompt).

export type DeviceState = 'ready' | 'denied' | 'missing' | 'lost';

export interface MediaWant {
  camera: boolean;
  mic: boolean;
}

export interface MediaAccess {
  stream: MediaStream | null;
  /** Null when that device was not asked for. */
  camera: DeviceState | null;
  mic: DeviceState | null;
}

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 320 },
  height: { ideal: 240 },
};

let current: { key: string; access: MediaAccess } | null = null;
let pending: { key: string; promise: Promise<MediaAccess> } | null = null;

function keyOf(want: MediaWant): string {
  return `${want.camera}:${want.mic}`;
}

function stateOf(error: unknown): DeviceState {
  const name = error instanceof Error ? error.name : '';
  return name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
    ? 'missing'
    : 'denied';
}

async function requestOne(
  constraints: MediaStreamConstraints,
): Promise<{ stream: MediaStream } | { state: DeviceState }> {
  try {
    return { stream: await navigator.mediaDevices.getUserMedia(constraints) };
  } catch (error) {
    return { state: stateOf(error) };
  }
}

async function openMedia(want: MediaWant): Promise<MediaAccess> {
  if (!want.camera && !want.mic) {
    return { stream: null, camera: null, mic: null };
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return {
      stream: null,
      camera: want.camera ? 'missing' : null,
      mic: want.mic ? 'missing' : null,
    };
  }

  if (want.camera && want.mic) {
    const both = await requestOne({ video: VIDEO_CONSTRAINTS, audio: true });
    if ('stream' in both) {
      return { stream: both.stream, camera: 'ready', mic: 'ready' };
    }
  }

  // Ask for each device alone, so one refusal does not cost the student the other.
  const tracks: MediaStreamTrack[] = [];
  let camera: DeviceState | null = null;
  let mic: DeviceState | null = null;
  if (want.camera) {
    const result = await requestOne({ video: VIDEO_CONSTRAINTS });
    if ('stream' in result) {
      tracks.push(...result.stream.getTracks());
      camera = 'ready';
    } else {
      camera = result.state;
    }
  }
  if (want.mic) {
    const result = await requestOne({ audio: true });
    if ('stream' in result) {
      tracks.push(...result.stream.getTracks());
      mic = 'ready';
    } else {
      mic = result.state;
    }
  }
  return { stream: tracks.length > 0 ? new MediaStream(tracks) : null, camera, mic };
}

export async function acquireMedia(want: MediaWant): Promise<MediaAccess> {
  const key = keyOf(want);
  if (current?.key === key) {
    return current.access;
  }
  if (pending?.key === key) {
    return pending.promise;
  }
  const promise = openMedia(want).then((access) => {
    current = { key, access };
    pending = null;
    return access;
  });
  pending = { key, promise };
  return promise;
}

export function currentMedia(): MediaAccess | null {
  return current?.access ?? null;
}

export function releaseMedia(): void {
  for (const track of current?.access.stream?.getTracks() ?? []) {
    track.stop();
  }
  current = null;
  pending = null;
}
