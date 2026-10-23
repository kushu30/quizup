import type { ExamStudentView } from '@quizup/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizSocket } from '../../lib/socket';
import { ExamAttemptView } from './ExamAttemptView';

const layer = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('../proctor/MediaProctorLayer', () => ({
  MediaProctorLayer: (props: Record<string, unknown>) => {
    layer.props = props;
    return <div data-testid="media-layer" />;
  },
}));
vi.mock('../../hooks/useProctor', () => ({
  useProctor: () => ({ fullscreenLost: false, requestFullscreen: vi.fn(), queuedCount: 0 }),
}));

const view: ExamStudentView = {
  phase: 'in_progress',
  durationMinutes: 20,
  consentVersion: 'v',
  attempt: {
    attemptId: '11111111-1111-4111-8111-111111111111',
    startedAtServerMs: Date.now(),
    deadlineAtServerMs: Date.now() + 1_200_000,
    submittedAtServerMs: null,
  },
  questions: [
    {
      questionId: '22222222-2222-4222-8222-222222222222',
      stem: 'One?',
      options: ['a', 'b', 'c', 'd'],
    },
  ],
  answers: {},
  resultsReleased: false,
};

function renderView(media?: { camera: boolean; mic: boolean; flagLimit: number | null }) {
  const socket = { emit: vi.fn(), on: vi.fn(), off: vi.fn() } as unknown as QuizSocket;
  render(
    <ExamAttemptView
      socket={socket}
      view={view}
      offsetMs={0}
      connected
      proctored
      media={media}
      onViewChange={() => undefined}
    />,
  );
}

afterEach(() => {
  cleanup();
  layer.props = null;
});

describe('ExamAttemptView camera and microphone', () => {
  it('runs the media layer for an attempt in progress when the host turned a device on', () => {
    renderView({ camera: true, mic: false, flagLimit: 10 });
    expect(screen.getByTestId('media-layer')).toBeTruthy();
    expect(layer.props).toMatchObject({
      active: true,
      room: { proctorCamera: true, proctorMic: false, proctorFlagLimit: 10 },
    });
  });

  it('adds nothing when no device is on', () => {
    renderView({ camera: false, mic: false, flagLimit: null });
    expect(screen.queryByTestId('media-layer')).toBeNull();
    cleanup();
    renderView(undefined);
    expect(screen.queryByTestId('media-layer')).toBeNull();
  });

  it('puts the warnings in the sticky header, where a scrolled student still sees them', () => {
    renderView({ camera: true, mic: false, flagLimit: 10 });
    expect(screen.getByTestId('media-layer').closest('.sticky')).not.toBeNull();
  });
});
