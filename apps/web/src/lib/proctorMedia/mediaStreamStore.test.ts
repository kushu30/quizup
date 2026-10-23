import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireMedia, currentMedia, releaseMedia } from './mediaStreamStore';

function fakeTrack(kind: 'video' | 'audio') {
  return { kind, stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() };
}

function fakeStream(kinds: ('video' | 'audio')[]) {
  const tracks = kinds.map(fakeTrack);
  return {
    tracks,
    stream: {
      getTracks: () => tracks,
      getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
      getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
    } as unknown as MediaStream,
  };
}

function setMediaDevices(
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null,
) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: getUserMedia ? { getUserMedia } : undefined,
  });
}

function domError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

beforeEach(() => {
  vi.stubGlobal(
    'MediaStream',
    class {
      private readonly list: unknown[];
      constructor(tracks: unknown[] = []) {
        this.list = tracks;
      }
      getTracks() {
        return this.list;
      }
      getVideoTracks() {
        return this.list.filter((track) => (track as { kind: string }).kind === 'video');
      }
      getAudioTracks() {
        return this.list.filter((track) => (track as { kind: string }).kind === 'audio');
      }
    },
  );
});

afterEach(() => {
  releaseMedia();
  setMediaDevices(null);
  vi.unstubAllGlobals();
});

describe('acquireMedia', () => {
  it('opens camera and microphone together and remembers the stream', async () => {
    const { stream } = fakeStream(['video', 'audio']);
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    setMediaDevices(getUserMedia);
    const access = await acquireMedia({ camera: true, mic: true });
    expect(access).toMatchObject({ stream, camera: 'ready', mic: 'ready' });
    expect(currentMedia()).toBe(access);
    const again = await acquireMedia({ camera: true, mic: true });
    expect(again).toBe(access);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('keeps the camera when only the microphone is refused', async () => {
    const video = fakeStream(['video']);
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      if (constraints.audio && constraints.video) {
        throw domError('NotAllowedError');
      }
      if (constraints.audio) {
        throw domError('NotAllowedError');
      }
      return video.stream;
    });
    setMediaDevices(getUserMedia);
    const access = await acquireMedia({ camera: true, mic: true });
    expect(access.camera).toBe('ready');
    expect(access.mic).toBe('denied');
    expect(access.stream?.getVideoTracks()).toHaveLength(1);
  });

  it('tells a refusal from a missing device', async () => {
    setMediaDevices(
      vi.fn(async (constraints: MediaStreamConstraints) => {
        throw domError(constraints.video ? 'NotAllowedError' : 'NotFoundError');
      }),
    );
    const access = await acquireMedia({ camera: true, mic: true });
    expect(access).toMatchObject({ stream: null, camera: 'denied', mic: 'missing' });
  });

  it('reports a browser without media support as missing, without throwing', async () => {
    setMediaDevices(null);
    expect(await acquireMedia({ camera: true, mic: false })).toEqual({
      stream: null,
      camera: 'missing',
      mic: null,
    });
  });

  it('stops every track when released', async () => {
    const { stream, tracks } = fakeStream(['video', 'audio']);
    setMediaDevices(vi.fn().mockResolvedValue(stream));
    await acquireMedia({ camera: true, mic: true });
    releaseMedia();
    for (const track of tracks) {
      expect(track.stop).toHaveBeenCalled();
    }
    expect(currentMedia()).toBeNull();
  });

  it('stops a stream that arrives after the page already released the devices', async () => {
    const late = fakeStream(['video', 'audio']);
    let grant: (stream: MediaStream) => void = () => undefined;
    setMediaDevices(
      vi.fn(
        () =>
          new Promise<MediaStream>((resolve) => {
            grant = resolve;
          }),
      ),
    );
    const pending = acquireMedia({ camera: true, mic: true });
    releaseMedia();
    grant(late.stream);
    const access = await pending;
    expect(access.stream).toBeNull();
    for (const track of late.tracks) {
      expect(track.stop).toHaveBeenCalled();
    }
    expect(currentMedia()).toBeNull();
  });

  it('stops the old devices when a different set is asked for', async () => {
    const first = fakeStream(['video', 'audio']);
    const second = fakeStream(['video']);
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(first.stream)
      .mockResolvedValueOnce(second.stream);
    setMediaDevices(getUserMedia);
    await acquireMedia({ camera: true, mic: true });
    await acquireMedia({ camera: true, mic: false });
    for (const track of first.tracks) {
      expect(track.stop).toHaveBeenCalled();
    }
    for (const track of second.tracks) {
      expect(track.stop).not.toHaveBeenCalled();
    }
  });
});
