import { randomUUID } from 'node:crypto';
import {
  EXAM_CONSENT_VERSION,
  type AnalyticsSnapshot,
  type ExamProgressPayload,
  type ExamStudentView,
  type ProctorEventRecord,
  type ProctorParticipantTimeline,
  type RoomStatePayload,
} from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { InMemoryLiveRepository, SeedQuestion } from '../live/inMemoryRepository.js';
import {
  TEST_HOST,
  sleep,
  startLiveHarness,
  type TestSocket,
} from '../live/liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

const DURATION_MINUTES = 10;
const DURATION_MS = DURATION_MINUTES * 60_000;
const GRACE_MS = 300;

function makeQuestions(count: number): SeedQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index + 1}`,
    options: [`alpha ${index}`, `bravo ${index}`, `charlie ${index}`, `delta ${index}`],
    correctIndex: index % 4,
    topic: index % 2 === 0 ? 'Algebra' : 'Geometry',
    difficulty: 'medium',
  }));
}

interface Student {
  name: string;
  socket: TestSocket;
  participantId: string;
  rejoinToken: string;
  received: { event: string; payload: unknown }[];
}

describe('exam mode', () => {
  const harnesses: Harness[] = [];
  let fakeNowMs = Date.now();

  afterEach(async () => {
    for (const harness of harnesses.splice(0)) {
      await harness.close();
    }
  });

  async function setup(options: {
    names: string[];
    questionCount?: number;
    repository?: InMemoryLiveRepository;
    open?: boolean;
  }) {
    fakeNowMs = Date.now();
    const harness = await startLiveHarness(
      { now: () => fakeNowMs },
      { sweepIntervalMs: 3_600_000 },
      { repository: options.repository },
    );
    harnesses.push(harness);
    const questions = makeQuestions(options.questionCount ?? 10);
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings: { mode: 'exam', durationMinutes: DURATION_MINUTES, adaptive: true },
      questions,
    });
    const summary = await harness.createSession(quizId, 20_000);

    const hostSocket = await harness.connect('host-token');
    const hostEvents: { event: string; payload: unknown }[] = [];
    (hostSocket as unknown as { onAny: (l: (e: string, p: unknown) => void) => void }).onAny(
      (event, payload) => hostEvents.push({ event, payload }),
    );
    await hostSocket.emitWithAck('room:join', { sessionId: summary.session.id });

    const students: Student[] = [];
    for (const name of options.names) {
      const joined = await harness.joinAsStudent(summary.joinCode, name);
      const received: Student['received'] = [];
      (joined.socket as unknown as { onAny: (l: (e: string, p: unknown) => void) => void }).onAny(
        (event, payload) => received.push({ event, payload }),
      );
      students.push({ name, ...joined, received });
    }
    if (options.open !== false) {
      await harness.hostRequest(`/sessions/${summary.session.id}/start`);
      await sleep(30);
    }
    return { harness, questions, summary, hostSocket, hostEvents, students, quizId };
  }

  async function startAttempt(student: Student): Promise<ExamStudentView> {
    const ack = await student.socket.emitWithAck('exam:start', {
      consentVersion: EXAM_CONSENT_VERSION,
    });
    if (!ack.ok) {
      throw new Error(`start failed: ${ack.error}`);
    }
    return ack.view;
  }

  function expectedCorrectDisplayed(
    harness: Harness,
    questions: SeedQuestion[],
    participantId: string,
    view: ExamStudentView,
  ): Map<string, number> {
    const attempt = harness.repository.examAttempts.find(
      (candidate) => candidate.participantId === participantId,
    );
    const result = new Map<string, number>();
    for (const question of view.questions) {
      const optionOrder = attempt?.optionOrders[question.questionId] ?? [];
      const original = questions.find((candidate) => candidate.id === question.questionId);
      result.set(question.questionId, optionOrder.indexOf(original?.correctIndex ?? -1));
    }
    return result;
  }

  it('does not create an attempt without valid consent and stores the consent version', async () => {
    const { harness, students, summary } = await setup({ names: ['Ada'], open: false });
    const ada = students[0] as Student;

    expect(
      await ada.socket.emitWithAck('exam:answer', {
        questionId: randomUUID(),
        displayedIndex: 0,
      }),
    ).toEqual({ ok: false, error: 'consent_required' });
    expect(
      await ada.socket.emitWithAck('exam:start', { consentVersion: EXAM_CONSENT_VERSION }),
    ).toEqual({ ok: false, error: 'exam_not_open' });

    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    await sleep(30);

    expect(await ada.socket.emitWithAck('exam:start', { consentVersion: 'old-text' })).toEqual({
      ok: false,
      error: 'consent_version_mismatch',
    });
    expect(
      await (
        ada.socket as unknown as { emitWithAck: (e: string, p: unknown) => Promise<unknown> }
      ).emitWithAck('exam:start', {}),
    ).toEqual({ ok: false, error: 'invalid_payload' });
    expect(harness.repository.examAttempts).toHaveLength(0);

    const view = await startAttempt(ada);
    expect(view.phase).toBe('in_progress');
    expect(harness.repository.examAttempts).toHaveLength(1);
    const stored = harness.repository.examAttempts[0];
    expect(stored?.consentVersion).toBe(EXAM_CONSENT_VERSION);
    expect(stored?.consentAtMs).toBe(stored?.startedAtMs);
    expect(stored?.deadlineAtMs).toBe((stored?.startedAtMs ?? 0) + DURATION_MS);

    await harness.exam.flushProctor();
    expect(harness.repository.proctorEvents.map((event) => event.type)).toEqual(['consent_given']);
    const again = await startAttempt(ada);
    expect(again.attempt?.attemptId).toBe(view.attempt?.attemptId);
    expect(harness.repository.examAttempts).toHaveLength(1);
  });

  it('gives each student their own order and maps answers back to the original option', async () => {
    const { harness, questions, students } = await setup({ names: ['Ada', 'Bo', 'Cy'] });
    const views = await Promise.all(students.map((student) => startAttempt(student)));

    const orders = views.map((view) =>
      view.questions.map((question) => question.questionId).join(),
    );
    expect(new Set(orders).size).toBe(3);
    for (const view of views) {
      expect(view.questions).toHaveLength(10);
      expect(new Set(view.questions.map((question) => question.questionId)).size).toBe(10);
    }

    const ada = students[0] as Student;
    const adaView = views[0] as ExamStudentView;
    const attempt = harness.repository.examAttempts.find(
      (candidate) => candidate.participantId === ada.participantId,
    );
    for (const question of adaView.questions) {
      const original = questions.find((candidate) => candidate.id === question.questionId);
      const optionOrder = attempt?.optionOrders[question.questionId] ?? [];
      expect(question.options).toEqual(optionOrder.map((index) => original?.options[index]));
    }

    const first = adaView.questions[0];
    const ack = await ada.socket.emitWithAck('exam:answer', {
      questionId: first?.questionId ?? '',
      displayedIndex: 2,
    });
    expect(ack).toEqual({ ok: true, answeredCount: 1 });
    const stored = harness.repository.examAnswers[0];
    expect(stored?.chosenOriginalIndex).toBe(attempt?.optionOrders[first?.questionId ?? '']?.[2]);

    await ada.socket.emitWithAck('exam:answer', {
      questionId: first?.questionId ?? '',
      displayedIndex: 0,
    });
    expect(harness.repository.examAnswers).toHaveLength(1);
    expect(harness.repository.examAnswers[0]?.chosenOriginalIndex).toBe(
      attempt?.optionOrders[first?.questionId ?? '']?.[0],
    );
  });

  it('never sends a correct answer to a student during the exam', async () => {
    const { harness, questions, students } = await setup({ names: ['Ada', 'Bo'] });
    const views = await Promise.all(students.map((student) => startAttempt(student)));
    const ada = students[0] as Student;
    const adaView = views[0] as ExamStudentView;
    for (const question of adaView.questions) {
      await ada.socket.emitWithAck('exam:answer', {
        questionId: question.questionId,
        displayedIndex: 1,
      });
    }
    await ada.socket.emitWithAck('exam:results', {});

    const everything = JSON.stringify(
      students.flatMap((student) => student.received).concat([{ event: 'views', payload: views }]),
    );
    expect(everything).not.toMatch(/correct_?index/i);
    expect(everything).not.toMatch(/"correct"/);
    void harness;
    void questions;
  });

  it('hides leaderboards, scores and other students from students', async () => {
    const { harness, students, summary, hostEvents } = await setup({ names: ['Ada', 'Bo'] });
    await Promise.all(students.map((student) => startAttempt(student)));
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(100);

    for (const student of students) {
      const names = student.received.map((entry) => entry.event);
      for (const forbidden of [
        'leaderboard:update',
        'question:show',
        'question:result',
        'analytics:snapshot',
        'proctor:timeline',
        'exam:progress',
      ]) {
        expect(names).not.toContain(forbidden);
      }
      const states = student.received
        .filter((entry) => entry.event === 'room:state')
        .map((entry) => entry.payload as RoomStatePayload);
      expect(states.length).toBeGreaterThan(0);
      for (const state of states) {
        expect(state.mode).toBe('exam');
        expect(state.leaderboard).toEqual([]);
        expect(state.you).toBeNull();
        expect(state.participants).toEqual([]);
      }
      const ended = student.received.find((entry) => entry.event === 'session:end');
      expect(ended?.payload).toMatchObject({ entries: [], you: null });
    }
    expect(hostEvents.some((entry) => entry.event === 'analytics:snapshot')).toBe(true);
  });

  it('shows the host no analytics snapshot while the exam runs and an alphabetical progress table', async () => {
    const { students, hostEvents, harness, summary } = await setup({
      names: ['Zed', 'Ada', 'Moe'],
    });
    const ada = students[1] as Student;
    const view = await startAttempt(ada);
    await ada.socket.emitWithAck('exam:answer', {
      questionId: view.questions[0]?.questionId ?? '',
      displayedIndex: 0,
    });
    await sleep(350);

    expect(hostEvents.filter((entry) => entry.event === 'analytics:snapshot')).toHaveLength(0);
    const progressEvents = hostEvents.filter((entry) => entry.event === 'exam:progress');
    const latest = progressEvents[progressEvents.length - 1]?.payload as ExamProgressPayload;
    expect(latest.rows.map((row) => row.displayName)).toEqual(['Ada', 'Moe', 'Zed']);
    expect(latest.rows[0]).toMatchObject({ status: 'in_progress', answered: 1, score: null });
    expect(latest.rows[1]).toMatchObject({ status: 'not_started', answered: 0 });

    await ada.socket.emitWithAck('exam:submit', {});
    await sleep(50);
    const afterSubmit = hostEvents.filter((entry) => entry.event === 'exam:progress').pop()
      ?.payload as ExamProgressPayload;
    expect(afterSubmit.rows[0]).toMatchObject({ status: 'submitted' });
    expect(typeof afterSubmit.rows[0]?.score).toBe('number');
    void harness;
    void summary;
  });

  it('expires at the deadline, rejects late answers and auto-submits', async () => {
    const { harness, students, questions } = await setup({ names: ['Ada', 'Bo', 'Cy'] });
    const views = await Promise.all(students.map((student) => startAttempt(student)));
    const [ada, bo, cy] = students as [Student, Student, Student];
    const deadline = harness.repository.examAttempts[0]?.deadlineAtMs ?? 0;

    const correctForAda = expectedCorrectDisplayed(
      harness,
      questions,
      ada.participantId,
      views[0] as ExamStudentView,
    );
    const firstQuestion = (views[0] as ExamStudentView).questions[0]?.questionId ?? '';
    fakeNowMs = deadline + GRACE_MS - 1;
    expect(
      await ada.socket.emitWithAck('exam:answer', {
        questionId: firstQuestion,
        displayedIndex: correctForAda.get(firstQuestion) ?? 0,
      }),
    ).toMatchObject({ ok: true });

    fakeNowMs = deadline + GRACE_MS + 50;
    const submitted = new Promise<unknown>((resolve) => ada.socket.once('exam:submitted', resolve));
    expect(
      await ada.socket.emitWithAck('exam:answer', { questionId: firstQuestion, displayedIndex: 1 }),
    ).toEqual({ ok: false, error: 'attempt_expired' });
    expect(await submitted).toEqual({ reason: 'deadline' });
    const adaAttempt = harness.repository.examAttempts.find(
      (a) => a.participantId === ada.participantId,
    );
    expect(adaAttempt?.submittedAtMs).not.toBeNull();
    expect(adaAttempt?.submittedAtMs).toBeLessThanOrEqual(deadline + GRACE_MS);
    expect(
      harness.repository.examAnswers.find((a) => a.attemptId === adaAttempt?.id)
        ?.chosenOriginalIndex,
    ).toBe(questions.find((q) => q.id === firstQuestion)?.correctIndex);
    expect(
      harness.repository.responses.filter((r) => r.participantId === ada.participantId),
    ).toHaveLength(1);

    const boSubmitted = new Promise<unknown>((resolve) =>
      bo.socket.once('exam:submitted', resolve),
    );
    await harness.exam.runSweep();
    expect(await boSubmitted).toEqual({ reason: 'deadline' });
    expect(harness.repository.examAttempts.every((attempt) => attempt.submittedAtMs !== null)).toBe(
      true,
    );
    void cy;
  });

  it('submits every open attempt when the host ends the exam', async () => {
    const { harness, students, summary } = await setup({ names: ['Ada', 'Bo', 'Cy'] });
    const views = await Promise.all(students.slice(0, 2).map((student) => startAttempt(student)));
    const ada = students[0] as Student;
    await ada.socket.emitWithAck('exam:answer', {
      questionId: (views[0] as ExamStudentView).questions[0]?.questionId ?? '',
      displayedIndex: 3,
    });

    const reasons: unknown[] = [];
    for (const student of students.slice(0, 2)) {
      student.socket.on('exam:submitted', (payload) => reasons.push(payload));
    }
    const response = await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    expect(response.status).toBe(200);
    await sleep(100);

    expect(reasons).toEqual([{ reason: 'host_ended' }, { reason: 'host_ended' }]);
    expect(harness.repository.examAttempts.every((attempt) => attempt.submittedAtMs !== null)).toBe(
      true,
    );
    expect(harness.repository.sessions.get(summary.session.id)?.session.status).toBe('ended');
    expect(harness.repository.responses).toHaveLength(1);
  });

  it('resumes the same attempt with the same order after a server restart', async () => {
    const first = await setup({ names: ['Ada'] });
    const ada = first.students[0] as Student;
    const view = await startAttempt(ada);
    const answeredId = view.questions[2]?.questionId ?? '';
    await ada.socket.emitWithAck('exam:answer', { questionId: answeredId, displayedIndex: 1 });
    await first.harness.exam.flushProctor();

    const repository = first.harness.repository;
    const second = await startLiveHarness(
      { now: () => fakeNowMs },
      { sweepIntervalMs: 3_600_000 },
      { repository },
    );
    harnesses.push(second);
    await second.engine.markAllStoredSessionsEnded();
    expect(repository.sessions.get(first.summary.session.id)?.session.status).toBe('running');
    await second.engine.rehydrateExamSessions();

    const returning = await second.connect();
    const statePromise = second.nextEvent(returning, 'room:state');
    const ack = await returning.emitWithAck('room:join', {
      joinCode: first.summary.joinCode,
      displayName: 'Ada',
      rejoinToken: ada.rejoinToken,
    });
    expect(ack).toMatchObject({ ok: true, participantId: ada.participantId });
    const state = await statePromise;

    expect(state.exam?.phase).toBe('in_progress');
    expect(state.exam?.attempt?.attemptId).toBe(view.attempt?.attemptId);
    expect(state.exam?.attempt?.deadlineAtServerMs).toBe(view.attempt?.deadlineAtServerMs);
    expect(state.exam?.questions).toEqual(view.questions);
    expect(state.exam?.answers).toEqual({ [answeredId]: 1 });
    expect(repository.examAttempts).toHaveLength(1);

    const resumed = await returning.emitWithAck('exam:start', {
      consentVersion: EXAM_CONSENT_VERSION,
    });
    expect(resumed.ok && resumed.view.attempt?.attemptId).toBe(view.attempt?.attemptId);
    expect(repository.examAttempts).toHaveLength(1);
  });

  it('keeps results hidden until the owner releases them, and release is idempotent', async () => {
    const { harness, students, summary, questions } = await setup({ names: ['Ada', 'Bo'] });
    const views = await Promise.all(students.map((student) => startAttempt(student)));
    const [ada, bo] = students as [Student, Student];
    const adaView = views[0] as ExamStudentView;
    const correct = expectedCorrectDisplayed(harness, questions, ada.participantId, adaView);

    expect(await ada.socket.emitWithAck('exam:results', {})).toEqual({
      ok: false,
      error: 'not_submitted',
    });

    for (const [index, question] of adaView.questions.slice(0, 4).entries()) {
      const displayed =
        index < 3
          ? (correct.get(question.questionId) ?? 0)
          : ((correct.get(question.questionId) ?? 0) + 1) % 4;
      await ada.socket.emitWithAck('exam:answer', {
        questionId: question.questionId,
        displayedIndex: displayed,
      });
    }
    await ada.socket.emitWithAck('exam:submit', {});
    await bo.socket.emitWithAck('exam:submit', {});

    const before = await ada.socket.emitWithAck('exam:results', {});
    expect(before).toEqual({ ok: true, released: false });
    expect(JSON.stringify(before)).not.toMatch(/score|correct|stem/);

    expect(
      (
        await harness.request(
          `/sessions/${summary.session.id}/release-results`,
          'other-host-token',
          'POST',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await harness.request(
          `/sessions/${summary.session.id}/release-results`,
          'student-token',
          'POST',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await harness.request(
          `/sessions/${summary.session.id}/release-results`,
          'admin-token',
          'POST',
        )
      ).status,
    ).toBe(404);
    expect(
      harness.repository.sessions.get(summary.session.id)?.session.results_released_at,
    ).toBeNull();

    const releasedEvent = new Promise((resolve) => ada.socket.once('exam:released', resolve));
    const release = await harness.request(
      `/sessions/${summary.session.id}/release-results`,
      'host-token',
      'POST',
    );
    expect(release.status).toBe(200);
    const releasedAt = ((await release.json()) as { releasedAtMs: number }).releasedAtMs;
    await releasedEvent;
    const again = await harness.request(
      `/sessions/${summary.session.id}/release-results`,
      'host-token',
      'POST',
    );
    expect(((await again.json()) as { releasedAtMs: number }).releasedAtMs).toBe(releasedAt);

    const after = await ada.socket.emitWithAck('exam:results', {});
    if (!after.ok || !after.released) {
      throw new Error('expected released results');
    }
    expect(after.results).toMatchObject({ score: 3, correctCount: 3, total: 10 });
    expect(after.results.questions).toHaveLength(10);
    expect(after.results.questions.filter((q) => q.correct === true)).toHaveLength(3);
    expect(after.results.questions.filter((q) => q.correct === false)).toHaveLength(1);
    expect(after.results.questions.filter((q) => q.correct === null)).toHaveLength(6);
    expect(JSON.stringify(after)).not.toMatch(/correct_?index/i);
    const first = after.results.questions[0];
    expect(first?.chosenOption).toBe(adaView.questions[0]?.options[first?.chosenIndex ?? 0]);
  });

  it('lets the host release results after the exam ended and the server restarted', async () => {
    const first = await setup({ names: ['Ada'] });
    const ada = first.students[0] as Student;
    const view = await startAttempt(ada);
    const correct = expectedCorrectDisplayed(
      first.harness,
      first.questions,
      ada.participantId,
      view,
    );
    for (const question of view.questions.slice(0, 4)) {
      await ada.socket.emitWithAck('exam:answer', {
        questionId: question.questionId,
        displayedIndex: correct.get(question.questionId) ?? 0,
      });
    }
    await first.harness.hostRequest(`/sessions/${first.summary.session.id}/end`);
    await sleep(50);

    const repository = first.harness.repository;
    const second = await startLiveHarness(
      { now: () => fakeNowMs },
      { sweepIntervalMs: 3_600_000 },
      { repository },
    );
    harnesses.push(second);
    await second.engine.markAllStoredSessionsEnded();
    await second.engine.rehydrateExamSessions();

    const returning = await second.connect();
    const statePromise = second.nextEvent(returning, 'room:state');
    const ack = await returning.emitWithAck('room:join', {
      joinCode: first.summary.joinCode,
      displayName: 'Ada',
      rejoinToken: ada.rejoinToken,
    });
    expect(ack.ok).toBe(true);
    const state = await statePromise;
    expect(state.status).toBe('ended');
    expect(state.exam).toMatchObject({ phase: 'submitted', resultsReleased: false });
    expect(await returning.emitWithAck('exam:results', {})).toEqual({ ok: true, released: false });

    const release = await second.request(
      `/sessions/${first.summary.session.id}/release-results`,
      'host-token',
      'POST',
    );
    expect(release.status).toBe(200);
    const results = await returning.emitWithAck('exam:results', {});
    expect(results.ok && results.released && results.results.score).toBe(4);
  });

  it('releases results from the database alone when the session is no longer in memory', async () => {
    const first = await setup({ names: ['Ada'] });
    const ada = first.students[0] as Student;
    await startAttempt(ada);
    await first.harness.hostRequest(`/sessions/${first.summary.session.id}/end`);
    await sleep(50);
    const id = first.summary.session.id;

    const second = await startLiveHarness(
      { now: () => fakeNowMs },
      { sweepIntervalMs: 3_600_000 },
      { repository: first.harness.repository },
    );
    harnesses.push(second);
    expect(second.engine.getExamContext(id)).toBeNull();

    expect(
      (await second.request(`/sessions/${id}/release-results`, 'other-host-token', 'POST')).status,
    ).toBe(404);
    expect(
      (await second.request(`/sessions/${randomUUID()}/release-results`, 'host-token', 'POST'))
        .status,
    ).toBe(404);
    expect(first.harness.repository.sessions.get(id)?.session.results_released_at).toBeNull();

    const release = await second.request(`/sessions/${id}/release-results`, 'host-token', 'POST');
    expect(release.status).toBe(200);
    const releasedAt = ((await release.json()) as { releasedAtMs: number }).releasedAtMs;
    expect(first.harness.repository.sessions.get(id)?.session.results_released_at).not.toBeNull();

    const again = await second.request(`/sessions/${id}/release-results`, 'host-token', 'POST');
    expect(((await again.json()) as { releasedAtMs: number }).releasedAtMs).toBe(releasedAt);
  });

  it('builds the Phase 5 summary for an ended exam with proctor counts and score ranks', async () => {
    const { harness, students, summary, questions } = await setup({ names: ['Ada', 'Bo'] });
    const views = await Promise.all(students.map((student) => startAttempt(student)));
    const [ada, bo] = students as [Student, Student];
    const adaCorrect = expectedCorrectDisplayed(
      harness,
      questions,
      ada.participantId,
      views[0] as ExamStudentView,
    );
    for (const question of (views[0] as ExamStudentView).questions.slice(0, 5)) {
      await ada.socket.emitWithAck('exam:answer', {
        questionId: question.questionId,
        displayedIndex: adaCorrect.get(question.questionId) ?? 0,
      });
    }
    const boCorrect = expectedCorrectDisplayed(
      harness,
      questions,
      bo.participantId,
      views[1] as ExamStudentView,
    );
    for (const question of (views[1] as ExamStudentView).questions.slice(0, 2)) {
      await bo.socket.emitWithAck('exam:answer', {
        questionId: question.questionId,
        displayedIndex: boCorrect.get(question.questionId) ?? 0,
      });
    }
    const now = fakeNowMs;
    for (let index = 0; index < 3; index += 1) {
      await bo.socket.emitWithAck('proctor:event', { type: 'tab_switch', clientAt: now });
    }
    await bo.socket.emitWithAck('proctor:event', {
      type: 'paste',
      clientAt: now,
      detail: { length: 9 },
    });
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);
    await sleep(100);

    const response = await harness.request(`/sessions/${summary.session.id}/summary`);
    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as AnalyticsSnapshot;
    expect(snapshot.mode).toBe('exam');
    const byName = new Map(
      snapshot.participants.map((participant) => [participant.displayName, participant]),
    );
    expect(byName.get('Ada')).toMatchObject({ score: 5, rank: 1, answered: 5, projection: null });
    expect(byName.get('Bo')).toMatchObject({ score: 2, rank: 2 });
    expect(byName.get('Bo')?.proctorCounts).toMatchObject({ tab_switch: 3, paste: 1, copy: 0 });
    expect(byName.get('Ada')?.proctorCounts?.tab_switch).toBe(0);
    expect(snapshot.questions.length).toBe(10);

    const csv = await (
      await harness.request(`/sessions/${summary.session.id}/export.csv?type=participants`)
    ).text();
    const header = csv.split('\r\n')[0] ?? '';
    expect(header).toContain('Proctor: Tab switch');
    expect(header).toContain('Proctor: Window resize');
    expect(csv).toContain(',3,0,0,0,1,0,0');

    const responses = await (
      await harness.request(`/sessions/${summary.session.id}/export.csv?type=responses`)
    ).text();
    expect(responses.trim().split('\r\n')).toHaveLength(8);
  });

  describe('proctor events', () => {
    it('rejects events before consent and never reaches the host', async () => {
      const { students, hostEvents } = await setup({ names: ['Ada'] });
      const ada = students[0] as Student;
      const ack = await ada.socket.emitWithAck('proctor:event', {
        type: 'tab_switch',
        clientAt: Date.now(),
      });
      expect(ack).toEqual({ ok: false, error: 'consent_required' });
      await sleep(50);
      expect(hostEvents.some((entry) => entry.event === 'proctor:timeline')).toBe(false);
    });

    it('validates events, stamps server time, flags late ones and emits to the host only', async () => {
      const { harness, students, hostEvents } = await setup({ names: ['Ada', 'Bo'] });
      const [ada, bo] = students as [Student, Student];
      await startAttempt(ada);
      await startAttempt(bo);

      const raw = ada.socket as unknown as {
        emitWithAck: (event: string, payload: unknown) => Promise<unknown>;
      };
      expect(
        await raw.emitWithAck('proctor:event', { type: 'keystroke', clientAt: fakeNowMs }),
      ).toEqual({
        ok: false,
        error: 'invalid_payload',
      });
      expect(
        await raw.emitWithAck('proctor:event', {
          type: 'paste',
          clientAt: fakeNowMs,
          detail: { length: 4, text: 'leaked' },
        }),
      ).toEqual({ ok: false, error: 'invalid_payload' });

      expect(
        await ada.socket.emitWithAck('proctor:event', {
          type: 'window_blur',
          clientAt: fakeNowMs - 1000,
        }),
      ).toEqual({ ok: true });
      expect(
        await ada.socket.emitWithAck('proctor:event', {
          type: 'fullscreen_exit',
          clientAt: fakeNowMs - 6000,
        }),
      ).toEqual({ ok: true });
      await sleep(50);

      const timeline = hostEvents
        .filter((entry) => entry.event === 'proctor:timeline')
        .map((entry) => entry.payload as ProctorEventRecord);
      const blur = timeline.find((record) => record.type === 'window_blur');
      const exit = timeline.find((record) => record.type === 'fullscreen_exit');
      expect(blur).toMatchObject({
        late: false,
        serverAt: fakeNowMs,
        participantId: ada.participantId,
      });
      expect(exit).toMatchObject({ late: true, clientAt: fakeNowMs - 6000 });
      expect(JSON.stringify(blur)).not.toContain('leaked');

      for (const student of students) {
        expect(student.received.some((entry) => entry.event === 'proctor:timeline')).toBe(false);
      }
      await harness.exam.flushProctor();
      expect(
        harness.repository.proctorEvents.filter((event) => event.type !== 'consent_given'),
      ).toHaveLength(2);
    });

    it('keeps events in the order they were sent', async () => {
      const { harness, students, hostEvents, summary } = await setup({ names: ['Ada'] });
      const ada = students[0] as Student;
      await startAttempt(ada);
      const sequence = [
        'tab_switch',
        'window_blur',
        'right_click',
        'fullscreen_exit',
        'right_click',
      ] as const;
      for (const [index, type] of sequence.entries()) {
        fakeNowMs += 1;
        await ada.socket.emitWithAck('proctor:event', {
          type,
          clientAt: fakeNowMs - 0 + index * 0,
        });
      }
      await sleep(50);
      const live = hostEvents
        .filter((entry) => entry.event === 'proctor:timeline')
        .map((entry) => (entry.payload as ProctorEventRecord).type)
        .filter((type) => type !== 'consent_given');
      expect(live).toEqual([...sequence]);

      const response = await harness.request(`/sessions/${summary.session.id}/proctor`);
      expect(response.status).toBe(200);
      const grouped = (await response.json()) as ProctorParticipantTimeline[];
      expect(grouped).toHaveLength(1);
      expect(
        grouped[0]?.events.map((event) => event.type).filter((type) => type !== 'consent_given'),
      ).toEqual([...sequence]);
      expect(grouped[0]?.counts).toMatchObject({
        tab_switch: 1,
        window_blur: 1,
        right_click: 2,
        fullscreen_exit: 1,
      });
    });

    it('caps events at 20 per second per socket and counts the dropped ones', async () => {
      const { harness, students, summary } = await setup({ names: ['Ada'] });
      const ada = students[0] as Student;
      await startAttempt(ada);
      const acks = await Promise.all(
        Array.from({ length: 50 }, () =>
          ada.socket.emitWithAck('proctor:event', { type: 'right_click', clientAt: fakeNowMs }),
        ),
      );
      const accepted = acks.filter((ack) => ack.ok).length;
      const limited = acks.filter((ack) => !ack.ok && ack.error === 'rate_limited').length;
      expect(accepted).toBe(20);
      expect(limited).toBe(30);
      const row = harness.exam.hostProgress(summary.session.id)?.[0];
      expect(row).toMatchObject({ droppedEvents: 30, proctorEventCount: 20 });
    });

    it('rejects events after the attempt is submitted', async () => {
      const { students } = await setup({ names: ['Ada'] });
      const ada = students[0] as Student;
      await startAttempt(ada);
      await ada.socket.emitWithAck('exam:submit', {});
      expect(
        await ada.socket.emitWithAck('proctor:event', { type: 'tab_switch', clientAt: fakeNowMs }),
      ).toEqual({ ok: false, error: 'no_open_attempt' });
    });

    it('still emits to the host when persistence fails, retries once, and never crashes', async () => {
      const { harness, students, hostEvents } = await setup({ names: ['Ada'] });
      const ada = students[0] as Student;
      await startAttempt(ada);
      await harness.exam.flushProctor();
      const before = harness.repository.proctorEvents.length;

      harness.repository.failProctorInsertsRemaining = 1;
      await ada.socket.emitWithAck('proctor:event', { type: 'right_click', clientAt: fakeNowMs });
      await harness.exam.flushProctor();
      expect(harness.repository.proctorEvents.length).toBe(before + 1);

      harness.repository.failProctorInsertsRemaining = 2;
      await ada.socket.emitWithAck('proctor:event', { type: 'right_click', clientAt: fakeNowMs });
      await harness.exam.flushProctor();
      expect(harness.repository.proctorEvents.length).toBe(before + 1);
      const timeline = hostEvents.filter((entry) => entry.event === 'proctor:timeline');
      expect(timeline.length).toBe(3);

      expect(
        await ada.socket.emitWithAck('proctor:event', { type: 'right_click', clientAt: fakeNowMs }),
      ).toEqual({ ok: true });
    });

    it('serves the grouped timeline to the owner and admin only', async () => {
      const { harness, students, summary } = await setup({ names: ['Zoe', 'Ada'] });
      await Promise.all(students.map((student) => startAttempt(student)));
      const id = summary.session.id;

      const owner = await harness.request(`/sessions/${id}/proctor`);
      expect(owner.status).toBe(200);
      const grouped = (await owner.json()) as ProctorParticipantTimeline[];
      expect(grouped.map((entry) => entry.displayName)).toEqual(['Ada', 'Zoe']);
      expect(grouped[0]?.events[0]?.type).toBe('consent_given');

      expect((await harness.request(`/sessions/${id}/proctor`, 'admin-token')).status).toBe(200);
      expect((await harness.request(`/sessions/${id}/proctor`, 'other-host-token')).status).toBe(
        403,
      );
      expect((await harness.request(`/sessions/${id}/proctor`, 'student-token')).status).toBe(403);
      expect((await harness.request(`/sessions/${randomUUID()}/proctor`)).status).toBe(404);
      expect((await harness.request(`/sessions/nope/proctor`)).status).toBe(400);
    });
  });
});
