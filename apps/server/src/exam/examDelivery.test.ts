import { randomUUID } from 'node:crypto';
import { EXAM_CONSENT_VERSION, type ExamResults, type ExamStudentView } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from '../live/inMemoryRepository.js';
import {
  TEST_HOST,
  sleep,
  startLiveHarness,
  type TestSocket,
} from '../live/liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

function questions(): SeedQuestion[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index + 1}`,
    options: ['alpha', 'bravo', 'charlie', 'delta'],
    correctIndex: 0,
    topic: index < 5 ? 'Module 1' : 'Module 2',
  }));
}

describe('exam delivery settings', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  async function openExam(settings: Record<string, unknown>, names: string[]) {
    harness = await startLiveHarness();
    const seeded = questions();
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings: { mode: 'exam', durationMinutes: 10, ...settings },
      questions: seeded,
    });
    const summary = await harness.createSession(quizId, 20_000);
    const students = [];
    for (const name of names) {
      students.push({ name, ...(await harness.joinAsStudent(summary.joinCode, name)) });
    }
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    await sleep(30);
    return { seeded, summary, students };
  }

  async function begin(socket: TestSocket): Promise<ExamStudentView> {
    const ack = await socket.emitWithAck('exam:start', { consentVersion: EXAM_CONSENT_VERSION });
    if (!ack.ok) {
      throw new Error(`start failed: ${ack.error}`);
    }
    return ack.view;
  }

  it('keeps the host’s question order and the original option order when both shuffles are off', async () => {
    const { seeded, students } = await openExam(
      { shuffleQuestions: false, shuffleOptions: false },
      ['Ada', 'Bo'],
    );
    for (const student of students) {
      const view = await begin(student.socket);
      expect(view.questions.map((item) => item.questionId)).toEqual(seeded.map((item) => item.id));
      for (const item of view.questions) {
        expect(item.options).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
      }
    }
  });

  it('still shuffles each student’s questions and options when the quiz never said otherwise', async () => {
    const { students } = await openExam({}, ['Ada', 'Bo', 'Cy']);
    const views = await Promise.all(students.map((student) => begin(student.socket)));
    expect(
      new Set(views.map((view) => view.questions.map((item) => item.questionId).join())).size,
    ).toBe(3);
  });

  it('gives each student their own draw from a pool, always including the other modules', async () => {
    const { seeded, students } = await openExam(
      { shuffleQuestions: false, pools: [{ module: 'Module 1', count: 2 }] },
      ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo'],
    );
    const views = await Promise.all(students.map((student) => begin(student.socket)));
    const module1 = new Set(
      seeded.filter((item) => item.topic === 'Module 1').map((item) => item.id),
    );
    const draws = views.map((view) => {
      expect(view.questions).toHaveLength(7);
      const drawn = view.questions.filter((item) => module1.has(item.questionId));
      expect(drawn).toHaveLength(2);
      return drawn.map((item) => item.questionId).join();
    });
    expect(new Set(draws).size).toBeGreaterThan(1);
  });

  it('counts a student’s result out of the questions they were given', async () => {
    const { summary, seeded, students } = await openExam(
      { pools: [{ module: 'Module 1', count: 2 }] },
      ['Ada'],
    );
    const ada = students[0] as (typeof students)[number];
    const view = await begin(ada.socket);
    for (const item of view.questions) {
      const original = seeded.find((candidate) => candidate.id === item.questionId);
      await ada.socket.emitWithAck('exam:answer', {
        questionId: item.questionId,
        displayedIndex: item.options.indexOf(original?.options[0] ?? ''),
      });
    }
    await ada.socket.emitWithAck('exam:submit', {});
    await harness.hostRequest(`/sessions/${summary.session.id}/release-results`);
    const results = (await ada.socket.emitWithAck('exam:results', {})) as {
      ok: boolean;
      released: boolean;
      results: ExamResults;
    };
    expect(results.results.total).toBe(7);
    expect(results.results.questions).toHaveLength(7);
    expect(results.results.correctCount).toBe(7);
  });

  it('shows the host how many questions each student will get, before they start', async () => {
    const { summary, students } = await openExam({ pools: [{ module: 'Module 1', count: 2 }] }, [
      'Ada',
    ]);
    expect(students).toHaveLength(1);
    const progress = harness.exam.hostProgress(summary.session.id);
    expect(progress?.[0]?.totalQuestions).toBe(7);
  });
});
