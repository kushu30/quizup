import { randomUUID } from 'node:crypto';
import {
  EXAM_CONSENT_MEDIA_VERSION,
  type ProctorParticipantTimeline,
  type ProctorSeriousType,
} from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { InMemoryLiveRepository, SeedQuestion } from '../live/inMemoryRepository.js';
import { TEST_HOST, sleep, startLiveHarness } from '../live/liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

function questions(): SeedQuestion[] {
  return Array.from({ length: 3 }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index + 1}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    topic: 'T',
  }));
}

describe('camera and microphone flags on the server', () => {
  const harnesses: Harness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  async function setup(options: {
    exam: boolean;
    start: Record<string, unknown>;
    repository?: InMemoryLiveRepository;
  }) {
    const harness = await startLiveHarness(
      { startDelayMs: 5 },
      { sweepIntervalMs: 3_600_000 },
      { repository: options.repository },
    );
    harnesses.push(harness);
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings: options.exam ? { mode: 'exam', durationMinutes: 10 } : {},
      questions: questions(),
    });
    const summary = await harness.createSession(quizId, 5000);
    const ada = await harness.joinAsStudent(summary.joinCode, 'Ada');
    const flags = harness.collectEvents(ada.socket, 'proctor:flags');
    const submitted = harness.collectEvents(ada.socket, 'exam:submitted');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`, options.start);
    await sleep(30);
    if (options.exam) {
      const started = await ada.socket.emitWithAck('exam:start', {
        consentVersion: EXAM_CONSENT_MEDIA_VERSION,
      });
      if (!started.ok) {
        throw new Error(`exam:start failed: ${started.error}`);
      }
    }
    return { harness, summary, ada, flags, submitted };
  }

  const event = (type: string, extra: Record<string, unknown> = {}) =>
    ({ type, clientAt: Date.now(), ...extra }) as never;

  async function timelineOf(
    harness: Harness,
    sessionId: string,
  ): Promise<ProctorParticipantTimeline> {
    await harness.exam.flushProctor();
    const response = await harness.request(`/sessions/${sessionId}/proctor`);
    const timelines = (await response.json()) as ProctorParticipantTimeline[];
    return timelines[0] as ProctorParticipantTimeline;
  }

  it('ignores a media event the host did not turn on', async () => {
    const { harness, summary, ada, flags } = await setup({
      exam: true,
      start: { proctored: true, proctorMic: true },
    });
    const ack = await ada.socket.emitWithAck('proctor:event', event('looking_away'));
    expect(ack).toEqual({ ok: true });
    await ada.socket.emitWithAck('proctor:event', event('face_missing'));
    const timeline = await timelineOf(harness, summary.session.id);
    expect(timeline.events.map((entry) => entry.type)).not.toContain('looking_away');
    expect(timeline.events.map((entry) => entry.type)).not.toContain('face_missing');
    expect(flags).toHaveLength(0);
  });

  it('counts each serious flag, tells the student, and submits at the limit', async () => {
    const { harness, summary, ada, flags, submitted } = await setup({
      exam: true,
      start: { proctored: true, proctorCamera: true, proctorFlagLimit: 3 },
    });
    for (const type of ['face_missing', 'multiple_faces', 'looking_away'] as ProctorSeriousType[]) {
      await ada.socket.emitWithAck('proctor:event', event(type));
    }
    await sleep(60);
    expect(flags.map((flag) => [flag.count, flag.limit])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(flags.map((flag) => flag.type)).toEqual([
      'face_missing',
      'multiple_faces',
      'looking_away',
    ]);
    expect(submitted).toEqual([{ reason: 'proctor_limit' }]);

    const timeline = await timelineOf(harness, summary.session.id);
    const types = timeline.events.map((entry) => entry.type);
    expect(types.filter((type) => type === 'auto_submitted')).toHaveLength(1);
    expect(types.indexOf('auto_submitted')).toBeGreaterThan(types.lastIndexOf('looking_away'));
    const row = harness.exam.hostProgress(summary.session.id)?.[0];
    expect(row).toMatchObject({ status: 'submitted', autoSubmitted: true });
  });

  it('does not submit twice or accept events after the submit', async () => {
    const { harness, summary, ada, submitted } = await setup({
      exam: true,
      start: { proctored: true, proctorCamera: true, proctorFlagLimit: 3 },
    });
    for (let index = 0; index < 3; index += 1) {
      await ada.socket.emitWithAck('proctor:event', event('face_missing'));
    }
    await sleep(60);
    const late = await ada.socket.emitWithAck('proctor:event', event('face_missing'));
    expect(late).toEqual({ ok: false, error: 'no_open_attempt' });
    expect(submitted).toHaveLength(1);
    const timeline = await timelineOf(harness, summary.session.id);
    expect(timeline.events.filter((entry) => entry.type === 'auto_submitted')).toHaveLength(1);
  });

  it('never counts browser signals toward the limit', async () => {
    const { ada, flags, submitted } = await setup({
      exam: true,
      start: { proctored: true, proctorCamera: true, proctorFlagLimit: 3 },
    });
    for (let index = 0; index < 5; index += 1) {
      await ada.socket.emitWithAck('proctor:event', event('tab_switch'));
    }
    await sleep(60);
    expect(flags).toHaveLength(0);
    expect(submitted).toHaveLength(0);
  });

  it('records a denied or lost device without counting it', async () => {
    const { harness, summary, ada, flags } = await setup({
      exam: true,
      start: { proctored: true, proctorCamera: true, proctorMic: true, proctorFlagLimit: 3 },
    });
    await ada.socket.emitWithAck('proctor:event', event('camera_denied'));
    await ada.socket.emitWithAck('proctor:event', event('mic_lost'));
    const timeline = await timelineOf(harness, summary.session.id);
    expect(timeline.events.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(['camera_denied', 'mic_lost']),
    );
    expect(flags).toHaveLength(0);
  });

  it('counts flags in a live quiz without a limit and never submits', async () => {
    const { ada, flags } = await setup({
      exam: false,
      start: { proctored: true, proctorMic: true, proctorFlagLimit: 3 },
    });
    await ada.socket.emitWithAck('proctor:event', event('loud_audio'));
    await ada.socket.emitWithAck('proctor:event', event('loud_audio'));
    await sleep(60);
    expect(flags.map((flag) => [flag.count, flag.limit])).toEqual([
      [1, null],
      [2, null],
    ]);
  });

  it('keeps the count across a server restart and still submits once', async () => {
    const first = await setup({
      exam: true,
      start: { proctored: true, proctorCamera: true, proctorFlagLimit: 3 },
    });
    await first.ada.socket.emitWithAck('proctor:event', event('face_missing'));
    await first.ada.socket.emitWithAck('proctor:event', event('face_missing'));
    await first.harness.exam.flushProctor();

    const repository = first.harness.repository;
    const second = await startLiveHarness({}, { sweepIntervalMs: 3_600_000 }, { repository });
    harnesses.push(second);
    await second.engine.markAllStoredSessionsEnded();
    await second.engine.rehydrateExamSessions();

    const returning = await second.connect();
    await returning.emitWithAck('room:join', {
      joinCode: first.summary.joinCode,
      displayName: 'Ada',
      rejoinToken: first.ada.rejoinToken,
    });
    const flags = second.collectEvents(returning, 'proctor:flags');
    const submitted = second.collectEvents(returning, 'exam:submitted');
    await returning.emitWithAck('proctor:event', event('face_missing'));
    await sleep(60);
    expect(flags.map((flag) => flag.count)).toEqual([3]);
    expect(submitted).toEqual([{ reason: 'proctor_limit' }]);
  });
});
