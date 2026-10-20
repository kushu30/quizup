import { randomUUID } from 'node:crypto';
import type { AnalyticsSnapshot, RoomStatePayload } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from './inMemoryRepository.js';
import { TEST_HOST, startLiveHarness } from './liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
const LAPTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function pool(): SeedQuestion[] {
  return Array.from({ length: 2 }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    topic: 'T',
  }));
}

describe('device of each student', () => {
  const harnesses: Harness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  async function setup(settings: unknown = {}) {
    const harness = await startLiveHarness();
    harnesses.push(harness);
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings,
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    return { harness, summary };
  }

  async function join(
    harness: Harness,
    joinCode: string,
    displayName: string,
    userAgent: string,
    extra: Record<string, unknown> = {},
  ) {
    const socket = await harness.connect(undefined, { 'user-agent': userAgent });
    const state = harness.nextEvent(socket, 'room:state');
    const ack = await socket.emitWithAck('room:join', { joinCode, displayName, ...extra });
    if (!ack.ok || ack.role !== 'student') {
      throw new Error(`join failed ${JSON.stringify(ack)}`);
    }
    return { socket, ack, state: await state };
  }

  async function hostState(harness: Harness, sessionId: string): Promise<RoomStatePayload> {
    const host = await harness.connect('host-token');
    const state = harness.nextEvent(host, 'room:state');
    await host.emitWithAck('room:join', { sessionId });
    return state;
  }

  it('shows the host what each student joined from, and nobody else', async () => {
    const { harness, summary } = await setup();
    await join(harness, summary.joinCode, 'Ada', IPHONE, {
      client: { screenWidth: 390, screenHeight: 844, touch: true },
    });
    const grace = await join(harness, summary.joinCode, 'Grace', LAPTOP);

    const host = await hostState(harness, summary.session.id);
    const ada = host.participants.find((participant) => participant.displayName === 'Ada');
    expect(ada?.devices).toEqual([
      { kind: 'phone', os: 'iOS 17', browser: 'Safari 17', screen: { width: 390, height: 844 } },
    ]);

    const raw = JSON.stringify(grace.state);
    expect(raw).not.toContain('Safari');
    expect(grace.state.participants.every((participant) => participant.devices.length === 0)).toBe(
      true,
    );
  });

  it('adds a second device when the same student comes back from elsewhere, once each', async () => {
    const { harness, summary } = await setup();
    const first = await join(harness, summary.joinCode, 'Ada', IPHONE);
    const rejoin = {
      rejoinToken: first.ack.ok && first.ack.role === 'student' ? first.ack.rejoinToken : '',
    };
    await join(harness, summary.joinCode, 'Ada', IPHONE, rejoin);
    await join(harness, summary.joinCode, 'Ada', LAPTOP, rejoin);

    const host = await hostState(harness, summary.session.id);
    const devices = host.participants.find(
      (participant) => participant.displayName === 'Ada',
    )?.devices;
    expect(devices?.map((device) => device.kind)).toEqual(['phone', 'computer']);
    expect(harness.repository.participants[0]?.devices).toHaveLength(2);
  });

  it('still lets the student in when saving the device fails', async () => {
    const { harness, summary } = await setup();
    harness.repository.updateParticipantDevices = async () => {
      throw new Error('column does not exist');
    };
    const { ack } = await join(harness, summary.joinCode, 'Ada', IPHONE);
    expect(ack.ok).toBe(true);
  });

  it('puts the devices in the analytics snapshot and the rebuilt summary', async () => {
    const { harness, summary } = await setup();
    await join(harness, summary.joinCode, 'Ada', IPHONE);
    const live = harness.engine.getAnalyticsSnapshot(summary.session.id, false);
    expect(live?.participants[0]?.devices[0]).toMatchObject({ kind: 'phone', os: 'iOS 17' });

    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    const response = await harness.request(`/sessions/${summary.session.id}/summary`);
    const stored = (await response.json()) as AnalyticsSnapshot;
    expect(stored.participants[0]?.devices[0]).toMatchObject({
      kind: 'phone',
      browser: 'Safari 17',
    });
  });

  it('survives a host restart: exam participants come back with their devices', async () => {
    const { harness, summary } = await setup({ mode: 'exam', durationMinutes: 10 });
    await join(harness, summary.joinCode, 'Ada', IPHONE);
    const open = await harness.repository.listOpenExamSessions();
    expect(open[0]?.participants[0]?.devices[0]).toMatchObject({ kind: 'phone' });
  });
});
