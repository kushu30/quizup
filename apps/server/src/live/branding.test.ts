import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from './inMemoryRepository.js';
import { TEST_HOST, startLiveHarness } from './liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

const BRAND = {
  institutionName: 'Lincoln High',
  tagline: 'Learning together',
  brandColor: '#7A1F2B',
  welcomeMessage: 'Good luck, everyone.',
};

function pool(): SeedQuestion[] {
  return Array.from({ length: 2 }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    topic: 'Fractions',
  }));
}

describe('branding in room state', () => {
  const harnesses: Harness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  async function joinStudent(harness: Harness, joinCode: string) {
    const socket = await harness.connect();
    const statePromise = harness.nextEvent(socket, 'room:state');
    const ack = await socket.emitWithAck('room:join', { joinCode, displayName: 'Ada' });
    if (!ack.ok) {
      throw new Error(`join failed: ${JSON.stringify(ack)}`);
    }
    return statePromise;
  }

  it('sends the quiz title and branding to students and the host', async () => {
    const harness = await startLiveHarness();
    harnesses.push(harness);
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      title: 'Fractions review',
      settings: { branding: BRAND },
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    const studentState = await joinStudent(harness, summary.joinCode);
    expect(studentState.quizTitle).toBe('Fractions review');
    expect(studentState.branding).toEqual(BRAND);

    const host = await harness.connect('host-token');
    const hostStatePromise = harness.nextEvent(host, 'room:state');
    await host.emitWithAck('room:join', { sessionId: summary.session.id });
    expect((await hostStatePromise).branding).toEqual(BRAND);
  });

  it('sends no branding for quizzes without it', async () => {
    const harness = await startLiveHarness();
    harnesses.push(harness);
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool() });
    const summary = await harness.createSession(quizId, 5000);
    const state = await joinStudent(harness, summary.joinCode);
    expect(state.quizTitle).toBe('Seeded quiz');
    expect(state.branding).toBeNull();
  });

  it('ignores broken stored branding instead of failing the session', async () => {
    const harness = await startLiveHarness();
    harnesses.push(harness);
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings: { mode: 'exam', durationMinutes: 20, branding: { logoUrl: 'javascript:alert(1)' } },
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    const state = await joinStudent(harness, summary.joinCode);
    expect(state.branding).toBeNull();
    expect(state.mode).toBe('exam');
  });

  it('keeps an exam branded after a server restart', async () => {
    const first = await startLiveHarness();
    harnesses.push(first);
    const quizId = first.repository.seedQuiz({
      hostId: TEST_HOST.id,
      title: 'End of unit exam',
      settings: { mode: 'exam', durationMinutes: 20, branding: BRAND },
      questions: pool(),
    });
    const summary = await first.createSession(quizId, 5000);
    const ada = await first.joinAsStudent(summary.joinCode, 'Ada');
    await first.hostRequest(`/sessions/${summary.session.id}/start`);

    const second = await startLiveHarness({}, {}, { repository: first.repository });
    harnesses.push(second);
    await second.engine.markAllStoredSessionsEnded();
    await second.engine.rehydrateExamSessions();
    const returning = await second.connect();
    const statePromise = second.nextEvent(returning, 'room:state');
    const ack = await returning.emitWithAck('room:join', {
      joinCode: summary.joinCode,
      displayName: 'Ada',
      rejoinToken: ada.rejoinToken,
    });
    expect(ack.ok).toBe(true);
    const state = await statePromise;
    expect(state.quizTitle).toBe('End of unit exam');
    expect(state.branding).toEqual(BRAND);
  });
});
