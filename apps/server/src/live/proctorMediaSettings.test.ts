import { randomUUID } from 'node:crypto';
import type { RoomStatePayload } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from './inMemoryRepository.js';
import { TEST_HOST, sleep, startLiveHarness } from './liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

function pool(): SeedQuestion[] {
  return Array.from({ length: 2 }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    topic: 'T',
  }));
}

describe('camera, microphone and flag-limit session settings', () => {
  const harnesses: Harness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  async function startWith(settings: unknown, body: Record<string, unknown>) {
    const harness = await startLiveHarness({ startDelayMs: 50 });
    harnesses.push(harness);
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings,
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    const student = await harness.joinAsStudent(summary.joinCode, 'Ada');
    const states = harness.collectEvents(student.socket, 'room:state');
    const response = await harness.hostRequest(`/sessions/${summary.session.id}/start`, body);
    expect(response.status).toBe(200);
    // A student gets several room states; the one that matters is the first after the start.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const running = states.find((state) => state.status === 'running');
      if (running) {
        return running as RoomStatePayload;
      }
      await sleep(50);
    }
    throw new Error('No running room state arrived');
  }

  it('tells students which devices the host turned on', async () => {
    const state = await startWith({}, { proctored: true, proctorCamera: true, proctorMic: false });
    expect(state).toMatchObject({
      proctored: true,
      proctorCamera: true,
      proctorMic: false,
      proctorFlagLimit: null,
    });
  });

  it('ignores camera, microphone and limit when proctoring is off', async () => {
    const state = await startWith(
      { mode: 'exam', durationMinutes: 10 },
      { proctored: false, proctorCamera: true, proctorMic: true, proctorFlagLimit: 5 },
    );
    expect(state).toMatchObject({
      proctored: false,
      proctorCamera: false,
      proctorMic: false,
      proctorFlagLimit: null,
    });
  });

  it('keeps the flag limit for an exam', async () => {
    const state = await startWith(
      { mode: 'exam', durationMinutes: 10 },
      { proctored: true, proctorCamera: true, proctorFlagLimit: 7 },
    );
    expect(state.proctorFlagLimit).toBe(7);
  });

  it('drops the flag limit for a live quiz, which has no per-student submit', async () => {
    const state = await startWith({}, { proctored: true, proctorMic: true, proctorFlagLimit: 7 });
    expect(state).toMatchObject({ proctorMic: true, proctorFlagLimit: null });
  });

  it('behaves as before when the new choices are not sent', async () => {
    const state = await startWith({}, { proctored: true });
    expect(state).toMatchObject({
      proctored: true,
      proctorCamera: false,
      proctorMic: false,
      proctorFlagLimit: null,
    });
  });
});
