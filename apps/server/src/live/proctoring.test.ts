import { randomUUID } from 'node:crypto';
import type {
  AnalyticsSnapshot,
  ProctorEventRecord,
  ProctorParticipantTimeline,
} from '@quizup/shared';
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

describe('proctoring chosen by the host for any assessment type', () => {
  const harnesses: Harness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  async function setup(settings: unknown = {}) {
    const harness = await startLiveHarness({ startDelayMs: 50 });
    harnesses.push(harness);
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings,
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    return { harness, summary };
  }

  const tabSwitch = () => ({ type: 'tab_switch' as const, clientAt: Date.now() });

  it('asks for a yes or no and rejects anything else', async () => {
    const { harness, summary } = await setup();
    await harness.joinAsStudent(summary.joinCode, 'Ada');
    const bad = await harness.hostRequest(`/sessions/${summary.session.id}/start`, {
      proctored: 'yes',
    });
    expect(bad.status).toBe(400);
    const good = await harness.hostRequest(`/sessions/${summary.session.id}/start`, {
      proctored: true,
    });
    expect(good.status).toBe(200);
  });

  it('defaults to proctored for exams and unproctored for quizzes when the host does not say', async () => {
    const exam = await setup({ mode: 'exam', durationMinutes: 10 });
    await exam.harness.joinAsStudent(exam.summary.joinCode, 'Ada');
    await exam.harness.hostRequest(`/sessions/${exam.summary.session.id}/start`);
    expect(exam.harness.repository.sessions.get(exam.summary.session.id)?.session.proctored).toBe(
      true,
    );

    const live = await setup();
    await live.harness.joinAsStudent(live.summary.joinCode, 'Ada');
    await live.harness.hostRequest(`/sessions/${live.summary.session.id}/start`);
    expect(live.harness.repository.sessions.get(live.summary.session.id)?.session.proctored).toBe(
      false,
    );
  });

  it('tells the students and the host when a live quiz starts proctored', async () => {
    const { harness, summary } = await setup();
    const ada = await harness.joinAsStudent(summary.joinCode, 'Ada');
    const host = await harness.joinAsHost(summary.session.id);
    const studentStates = harness.collectEvents(ada.socket, 'room:state');
    const hostStates = harness.collectEvents(host, 'room:state');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`, { proctored: true });
    await sleep(120);
    expect(studentStates.at(-1)?.proctored).toBe(true);
    expect(hostStates.at(-1)?.proctored).toBe(true);
    expect(hostStates.at(-1)?.startedAtServerMs).toBeGreaterThan(0);
  });

  it('records signals in a proctored live quiz and shows them to the host only', async () => {
    const { harness, summary } = await setup();
    const ada = await harness.joinAsStudent(summary.joinCode, 'Ada');
    const host = await harness.joinAsHost(summary.session.id);
    const timeline = harness.collectEvents(host, 'proctor:timeline');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`, { proctored: true });
    await sleep(120);

    expect(await ada.socket.emitWithAck('proctor:event', tabSwitch())).toEqual({ ok: true });
    expect(await ada.socket.emitWithAck('proctor:event', tabSwitch())).toEqual({ ok: true });
    await sleep(60);
    expect(timeline.map((record: ProctorEventRecord) => record.type)).toEqual([
      'tab_switch',
      'tab_switch',
    ]);
    expect(timeline[0]?.attemptId).toBeNull();

    const response = await harness.request(`/sessions/${summary.session.id}/proctor`);
    const body = (await response.json()) as ProctorParticipantTimeline[];
    expect(body[0]?.counts.tab_switch).toBe(2);

    const snapshot = harness.engine.getAnalyticsSnapshot(summary.session.id, false);
    expect(snapshot?.participants[0]?.proctorCounts?.tab_switch).toBe(2);
  });

  it('ignores signals from a quiz that is not proctored', async () => {
    const { harness, summary } = await setup();
    const ada = await harness.joinAsStudent(summary.joinCode, 'Ada');
    const host = await harness.joinAsHost(summary.session.id);
    const timeline = harness.collectEvents(host, 'proctor:timeline');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`, { proctored: false });
    await sleep(120);
    expect(await ada.socket.emitWithAck('proctor:event', tabSwitch())).toEqual({ ok: true });
    await sleep(60);
    expect(timeline).toEqual([]);
    expect(harness.repository.proctorEvents).toEqual([]);
    const snapshot = harness.engine.getAnalyticsSnapshot(summary.session.id, false);
    expect(snapshot?.participants[0]?.proctorCounts).toBeNull();
  });

  it('records nothing before the quiz has started', async () => {
    const { harness, summary } = await setup();
    const ada = await harness.joinAsStudent(summary.joinCode, 'Ada');
    expect(await ada.socket.emitWithAck('proctor:event', tabSwitch())).toEqual({
      ok: false,
      error: 'no_open_attempt',
    });
  });

  it('lets a host run an exam without proctoring: no signals, no counts', async () => {
    const { harness, summary } = await setup({ mode: 'exam', durationMinutes: 10 });
    const ada = await harness.joinAsStudent(summary.joinCode, 'Ada');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`, { proctored: false });
    await sleep(60);
    await ada.socket.emitWithAck('exam:start', { consentVersion: 'exam-consent-2026-10-v1' });
    expect(await ada.socket.emitWithAck('proctor:event', tabSwitch())).toEqual({ ok: true });
    await sleep(60);
    expect(
      harness.repository.proctorEvents.filter((event) => event.type !== 'consent_given'),
    ).toEqual([]);
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    const snapshot = (await (
      await harness.request(`/sessions/${summary.session.id}/summary`)
    ).json()) as AnalyticsSnapshot;
    expect(snapshot.participants[0]?.proctorCounts).toBeNull();
  });
});
