import { randomUUID } from 'node:crypto';
import { joinInfoSchema } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from '../live/inMemoryRepository.js';
import { TEST_HOST, sleep, startLiveHarness } from '../live/liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

const BRAND = {
  institutionName: 'St. Xavier College',
  brandColor: '#7A1F2B',
  welcomeMessage: 'Welcome to the mid-term.',
  instructions: 'Calculators are allowed.',
};

function pool(): SeedQuestion[] {
  return Array.from({ length: 2 }, (_, index) => ({
    id: randomUUID(),
    stem: `Secret stem ${index}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    topic: 'Fractions',
  }));
}

describe('public join info', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  async function lookup(code: string) {
    return fetch(`${harness.baseUrl}/join-info/${code}`);
  }

  it('tells an anonymous visitor the title, brand and type for a join code', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      title: 'Mid-term',
      settings: { adaptive: true, branding: BRAND },
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    const response = await lookup(summary.joinCode);
    expect(response.status).toBe(200);
    const body = joinInfoSchema.parse(await response.json());
    expect(body).toEqual({
      quizTitle: 'Mid-term',
      branding: BRAND,
      assessmentType: 'adaptive',
      accessMode: 'open',
      durationMinutes: null,
      status: 'lobby',
    });
  });

  it('accepts the code in any letter case', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool() });
    const summary = await harness.createSession(quizId, 5000);
    expect((await lookup(summary.joinCode.toLowerCase())).status).toBe(200);
  });

  it('reports a timed exam with its length', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings: { mode: 'exam', durationMinutes: 45 },
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    const body = joinInfoSchema.parse(await (await lookup(summary.joinCode)).json());
    expect(body).toMatchObject({ assessmentType: 'exam', durationMinutes: 45, branding: null });
  });

  it('shows that a finished live quiz has ended', async () => {
    harness = await startLiveHarness({ startDelayMs: 5 });
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions: pool() });
    const summary = await harness.createSession(quizId, 5000);
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    await sleep(30);
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(60);
    expect(joinInfoSchema.parse(await (await lookup(summary.joinCode)).json()).status).toBe(
      'ended',
    );
  });

  it('says nothing about unknown codes and badly formed ones', async () => {
    harness = await startLiveHarness();
    expect((await lookup('ZZZZZZ')).status).toBe(404);
    expect((await lookup('AB')).status).toBe(404);
    expect((await lookup('bad%20code')).status).toBe(404);
  });

  it('never reveals questions, ids or the host', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings: { branding: BRAND },
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    const response = await lookup(summary.joinCode);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('St. Xavier College');
    for (const secret of [
      'Secret stem',
      TEST_HOST.id,
      summary.session.id,
      quizId,
      'correctIndex',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('slows down a visitor who tries codes in bulk', async () => {
    harness = await startLiveHarness();
    let limited = 0;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if ((await lookup('ZZZZZZ')).status === 429) {
        limited += 1;
      }
    }
    expect(limited).toBeGreaterThan(0);
  });
});
