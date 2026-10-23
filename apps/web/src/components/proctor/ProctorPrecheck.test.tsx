import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProctorPrecheck } from './ProctorPrecheck';

const mocks = vi.hoisted(() => ({ acquireMedia: vi.fn(), createAudioMeter: vi.fn() }));
vi.mock('../../lib/proctorMedia/mediaStreamStore', () => ({ acquireMedia: mocks.acquireMedia }));
vi.mock('../../lib/proctorMedia/audioMeter', () => ({ createAudioMeter: mocks.createAudioMeter }));

const stream = {
  getVideoTracks: () => [{}],
  getAudioTracks: () => [{}],
  getTracks: () => [],
} as unknown as MediaStream;

let level: number;
let stopMeter: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  level = 0;
  stopMeter = vi.fn();
  vi.stubGlobal(
    'MediaStream',
    class {
      getTracks() {
        return [];
      }
    },
  );
  mocks.acquireMedia.mockReset().mockResolvedValue({ stream, camera: 'ready', mic: 'ready' });
  mocks.createAudioMeter
    .mockReset()
    .mockImplementation(() => ({ read: () => level, stop: stopMeter }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

describe('ProctorPrecheck', () => {
  it('asks for the devices the host turned on and shows them ready', async () => {
    render(<ProctorPrecheck camera mic onContinue={vi.fn()} />);
    await settle();
    expect(mocks.acquireMedia).toHaveBeenCalledWith({ camera: true, mic: true });
    expect(screen.getByRole('heading').textContent).toContain('camera and microphone');
    expect(screen.getByText('Camera').nextSibling?.textContent).toBe('Ready');
    expect(screen.getByText('Microphone').nextSibling?.textContent).toBe('Ready');
    expect(screen.getByTestId('self-view')).toBeTruthy();
  });

  it('says nothing is recorded or sent', async () => {
    render(<ProctorPrecheck camera mic={false} onContinue={vi.fn()} />);
    await settle();
    expect(screen.getByText(/nothing is recorded or sent/i)).toBeTruthy();
  });

  it('asks only about the camera when only the camera is on', async () => {
    render(<ProctorPrecheck camera mic={false} onContinue={vi.fn()} />);
    await settle();
    expect(mocks.acquireMedia).toHaveBeenCalledWith({ camera: true, mic: false });
    expect(screen.queryByText('Microphone')).toBeNull();
    expect(screen.getByRole('heading').textContent).not.toContain('microphone');
  });

  it('moves the level bar with the sound', async () => {
    render(<ProctorPrecheck camera={false} mic onContinue={vi.fn()} />);
    await settle();
    const meter = screen.getByRole('meter');
    expect(Number(meter.getAttribute('aria-valuenow'))).toBe(0);
    level = 0.3;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(Number(meter.getAttribute('aria-valuenow'))).toBeGreaterThan(20);
  });

  it('lets the student continue even when a device is blocked, and explains what the host will see', async () => {
    mocks.acquireMedia.mockResolvedValue({ stream: null, camera: 'denied', mic: 'missing' });
    const onContinue = vi.fn();
    render(<ProctorPrecheck camera mic onContinue={onContinue} />);
    await settle();
    expect(screen.getByText('Camera').nextSibling?.textContent).toBe('Blocked');
    expect(screen.getByText('Microphone').nextSibling?.textContent).toBe('Not found');
    expect(screen.queryByTestId('self-view')).toBeNull();
    expect(screen.getByText(/your host will see/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the student leaves the screen', async () => {
    const { unmount } = render(<ProctorPrecheck camera={false} mic onContinue={vi.fn()} />);
    await settle();
    unmount();
    expect(stopMeter).toHaveBeenCalled();
  });
});
