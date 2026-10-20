import { randomUUID } from 'node:crypto';
import { EXAM_CONSENT_VERSION, type RoomStatePayload } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from './inMemoryRepository.js';
import { TEST_HOST, sleep, startLiveHarness } from './liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

const IMAGE = 'https://abc.supabase.co/storage/v1/object/public/question-images/host/cat.png';

function question(stem: string, withImage: boolean): SeedQuestion {
  return {
    id: randomUUID(),
    stem,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    ...(withImage ? { imageUrl: IMAGE, imageAlt: 'A cat on a sofa' } : {}),
  };
}

describe('question images', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  it('sends the image and its description with a live question, to students and the host', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      questions: [question('Which animal?', true)],
    });
    const summary = await harness.createSession(quizId, 2000);
    const host = await harness.joinAsHost(summary.session.id);
    const states = harness.collectEvents(host, 'room:state');
    const student = await harness.joinAsStudent(summary.joinCode, 'Ada');
    const shownPromise = harness.nextEvent(student.socket, 'question:show');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    const shown = await shownPromise;
    expect(shown).toMatchObject({ imageUrl: IMAGE, imageAlt: 'A cat on a sofa' });
    await sleep(50);
    const running = states.find((state: RoomStatePayload) => state.currentQuestion);
    expect(running?.currentQuestion).toMatchObject({
      imageUrl: IMAGE,
      imageAlt: 'A cat on a sofa',
    });
  });

  it('leaves the image fields out entirely for a question without one', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      questions: [question('No picture here', false)],
    });
    const summary = await harness.createSession(quizId, 2000);
    const student = await harness.joinAsStudent(summary.joinCode, 'Ada');
    const shownPromise = harness.nextEvent(student.socket, 'question:show');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    const shown = await shownPromise;
    expect(shown).not.toHaveProperty('imageUrl');
    expect(shown).not.toHaveProperty('imageAlt');
  });

  it('shows the image in a student’s exam attempt', async () => {
    harness = await startLiveHarness();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings: { mode: 'exam', durationMinutes: 10 },
      questions: [question('Which animal?', true), question('Plain one', false)],
    });
    const summary = await harness.createSession(quizId, 20_000);
    const student = await harness.joinAsStudent(summary.joinCode, 'Ada');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    await sleep(30);
    const ack = await student.socket.emitWithAck('exam:start', {
      consentVersion: EXAM_CONSENT_VERSION,
    });
    if (!ack.ok) {
      throw new Error(ack.error);
    }
    const withImage = ack.view.questions.find((item) => item.stem === 'Which animal?');
    const plain = ack.view.questions.find((item) => item.stem === 'Plain one');
    expect(withImage).toMatchObject({ imageUrl: IMAGE, imageAlt: 'A cat on a sofa' });
    expect(plain).not.toHaveProperty('imageUrl');
  });
});
