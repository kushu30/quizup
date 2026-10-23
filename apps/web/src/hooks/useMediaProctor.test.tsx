import type { ProctorEventPayload } from '@quizup/shared';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FaceBox } from '../lib/proctorMedia/frameAnalysis';
import type { MediaAccess } from '../lib/proctorMedia/mediaStreamStore';
import { useMediaProctor } from './useMediaProctor';

const mocks = vi.hoisted(() => ({
  acquireMedia: vi.fn(),
  createFaceSampler: vi.fn(),
  createAudioMeter: vi.fn(),
}));

vi.mock('../lib/proctorMedia/mediaStreamStore', () => ({ acquireMedia: mocks.acquireMedia }));
vi.mock('../lib/proctorMedia/faceSampler', () => ({ createFaceSampler: mocks.createFaceSampler }));
vi.mock('../lib/proctorMedia/audioMeter', () => ({ createAudioMeter: mocks.createAudioMeter }));

interface FakeTrack {
  addEventListener: (type: string, listener: () => void) => void;
  end: () => void;
}

function fakeStream() {
  const listeners: { video: (() => void)[]; audio: (() => void)[] } = { video: [], audio: [] };
  const track = (kind: 'video' | 'audio'): FakeTrack => ({
    addEventListener: (type, listener) => {
      if (type === 'ended') {
        listeners[kind].push(listener);
      }
    },
    end: () => listeners[kind].forEach((listener) => listener()),
  });
  const video = track('video');
  const audio = track('audio');
  return {
    video,
    audio,
    stream: {
      getVideoTracks: () => [video],
      getAudioTracks: () => [audio],
      getTracks: () => [video, audio],
    } as unknown as MediaStream,
  };
}

const GOOD_FACE: FaceBox = {
  keypoints: [
    { x: 0.4, y: 0.4 },
    { x: 0.6, y: 0.4 },
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 0.6 },
  ],
};
const TURNED_FACE: FaceBox = {
  keypoints: [
    { x: 0.4, y: 0.4 },
    { x: 0.6, y: 0.4 },
    { x: 0.68, y: 0.5 },
    { x: 0.5, y: 0.6 },
  ],
};

let sampleResult: { faces: FaceBox[]; brightness: number } | null;
let audioLevel: number;
let sent: ProctorEventPayload[];
let stopSampler: ReturnType<typeof vi.fn>;
let stopMeter: ReturnType<typeof vi.fn>;
let media: ReturnType<typeof fakeStream>;

function access(overrides: Partial<MediaAccess> = {}): MediaAccess {
  return { stream: media.stream, camera: 'ready', mic: 'ready', ...overrides };
}

function mount(options: { enabled?: boolean; camera?: boolean; mic?: boolean } = {}) {
  return renderHook(
    (props) =>
      useMediaProctor({
        enabled: props.enabled ?? true,
        camera: props.camera ?? true,
        mic: props.mic ?? false,
        send: (event) => sent.push(event),
        now: () => Date.now(),
      }),
    { initialProps: options },
  );
}

async function run(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
  media = fakeStream();
  sent = [];
  sampleResult = { faces: [GOOD_FACE], brightness: 120 };
  audioLevel = 0.01;
  stopSampler = vi.fn();
  stopMeter = vi.fn();
  setHidden(false);
  mocks.acquireMedia.mockReset().mockImplementation(async () => access());
  mocks.createFaceSampler
    .mockReset()
    .mockImplementation(async () => ({ sample: () => sampleResult, stop: stopSampler }));
  mocks.createAudioMeter
    .mockReset()
    .mockImplementation(() => ({ read: () => audioLevel, stop: stopMeter }));
});

afterEach(() => {
  cleanup();
  setHidden(false);
  vi.useRealTimers();
});

describe('useMediaProctor access', () => {
  it('does nothing when it is not enabled', async () => {
    mount({ enabled: false });
    await run(10_000);
    expect(mocks.acquireMedia).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('logs one camera_denied and keeps going when the camera is refused', async () => {
    mocks.acquireMedia.mockImplementation(async () => access({ stream: null, camera: 'denied' }));
    const { result } = mount();
    await run(20_000);
    expect(sent.map((event) => event.type)).toEqual(['camera_denied']);
    expect(result.current.camera).toBe('denied');
    expect(mocks.createFaceSampler).not.toHaveBeenCalled();
  });

  it('logs mic_denied for a missing microphone', async () => {
    mocks.acquireMedia.mockImplementation(async () =>
      access({ stream: null, camera: null, mic: 'missing' }),
    );
    mount({ camera: false, mic: true });
    await run(1000);
    expect(sent.map((event) => event.type)).toEqual(['mic_denied']);
  });

  it('degrades to camera_denied when the detector cannot start', async () => {
    mocks.createFaceSampler.mockImplementation(async () => null);
    const { result } = mount();
    await run(10_000);
    expect(sent.map((event) => event.type)).toEqual(['camera_denied']);
    expect(result.current.camera).toBe('missing');
  });

  it('does not throw when the detector fails to load', async () => {
    mocks.createFaceSampler.mockImplementation(async () => {
      throw new Error('wasm failed');
    });
    mount();
    await run(5000);
    expect(sent.map((event) => event.type)).toEqual(['camera_denied']);
  });

  it('logs camera_lost once when the camera track ends', async () => {
    const { result } = mount({ camera: true, mic: true });
    await run(1000);
    act(() => media.video.end());
    act(() => media.video.end());
    expect(sent.filter((event) => event.type === 'camera_lost')).toHaveLength(1);
    expect(result.current.camera).toBe('lost');
    act(() => media.audio.end());
    expect(sent.filter((event) => event.type === 'mic_lost')).toHaveLength(1);
  });
});

describe('useMediaProctor camera flags', () => {
  it('flags a missing face only after the hold time, then again as the episode goes on', async () => {
    sampleResult = { faces: [], brightness: 120 };
    mount();
    await run(2900);
    expect(sent).toEqual([]);
    await run(1100);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'face_missing', detail: { continued: false } });
    await run(30_000);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ type: 'face_missing', detail: { continued: true } });
  });

  // The hold time counts from the first sample that sees the condition, and samples come once a
  // second, so a flag arrives between the hold time and one second after it.
  it('flags several faces once they have held for two seconds', async () => {
    sampleResult = { faces: [GOOD_FACE, GOOD_FACE], brightness: 120 };
    mount();
    await run(2900);
    expect(sent).toEqual([]);
    await run(1200);
    expect(sent.map((event) => event.type)).toEqual(['multiple_faces']);
  });

  it('flags a turned head once it has held for four seconds', async () => {
    sampleResult = { faces: [TURNED_FACE], brightness: 120 };
    mount();
    await run(4000);
    expect(sent).toEqual([]);
    await run(1100);
    expect(sent.map((event) => event.type)).toEqual(['looking_away']);
  });

  it('calls a black frame a blocked camera, not a missing face', async () => {
    sampleResult = { faces: [], brightness: 2 };
    mount();
    await run(8000);
    expect(sent.map((event) => event.type)).toEqual(['camera_blocked']);
  });

  it('does not flag anything while the tab is hidden, and starts fresh when it returns', async () => {
    sampleResult = { faces: [], brightness: 120 };
    mount();
    await run(2000);
    setHidden(true);
    await run(60_000);
    expect(sent).toEqual([]);
    setHidden(false);
    await run(1500);
    expect(sent).toEqual([]);
    await run(2500);
    expect(sent.map((event) => event.type)).toEqual(['face_missing']);
  });

  it('stays quiet for a face that is there', async () => {
    mount();
    await run(120_000);
    expect(sent).toEqual([]);
  });
});

describe('useMediaProctor microphone flag', () => {
  it('flags sustained loud sound, but only after the room has been learned', async () => {
    const { result } = mount({ camera: false, mic: true });
    await run(5000);
    audioLevel = 0.5;
    await run(1500);
    expect(sent).toEqual([]);
    await run(1000);
    expect(sent.map((event) => event.type)).toEqual(['loud_audio']);
    expect(result.current.mic).toBe('ready');
  });

  it('ignores a short burst of noise', async () => {
    mount({ camera: false, mic: true });
    await run(5000);
    audioLevel = 0.5;
    await run(750);
    audioLevel = 0.01;
    await run(10_000);
    expect(sent).toEqual([]);
  });
});

describe('useMediaProctor cleanup', () => {
  it('stops sampling and the audio meter on unmount', async () => {
    sampleResult = { faces: [], brightness: 120 };
    const { unmount } = mount({ camera: true, mic: true });
    await run(1000);
    unmount();
    expect(stopSampler).toHaveBeenCalled();
    expect(stopMeter).toHaveBeenCalled();
    await run(120_000);
    expect(sent).toEqual([]);
  });
});
