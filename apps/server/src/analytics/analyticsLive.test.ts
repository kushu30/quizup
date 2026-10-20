import { randomUUID } from 'node:crypto';
import type { AnalyticsSnapshot, ServerToClientEvents, SessionSummary } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveEngine } from '../live/engine.js';
import { InMemoryLiveRepository, type SeedQuestion } from '../live/inMemoryRepository.js';
import { TEST_HOST, sleep, startLiveHarness } from '../live/liveHarness.testkit.js';
import type { EngineEventName, LivePublisher } from '../live/types.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

function makeQuestions(count: number): SeedQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: index % 4,
    topic: index % 2 === 0 ? 'Algebra' : 'Geometry',
    difficulty: 'medium',
  }));
}

class RecordingPublisher implements LivePublisher {
  readonly snapshots: AnalyticsSnapshot[] = [];

  emitToSession() {
    return undefined;
  }

  emitToParticipant() {
    return undefined;
  }

  emitToHost<Event extends EngineEventName>(
    _sessionId: string,
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ) {
    if (event === 'analytics:snapshot') {
      this.snapshots.push(args[0] as AnalyticsSnapshot);
    }
  }
}

describe('analytics emission throttle', () => {
  const engines: LiveEngine[] = [];

  afterEach(() => {
    for (const engine of engines) {
      engine.shutdown();
    }
  });

  it('coalesces a burst of answers and still emits immediately on round close', async () => {
    const repository = new InMemoryLiveRepository();
    const publisher = new RecordingPublisher();
    const engine = new LiveEngine({
      repository,
      publisher,
      startDelayMs: 20,
      graceMs: 50,
      hostRefreshIntervalMs: 20,
    });
    engines.push(engine);
    const quizId = repository.seedQuiz({ hostId: TEST_HOST.id, questions: makeQuestions(2) });
    const summary = await engine.createSession({
      quizId,
      hostId: TEST_HOST.id,
      questionDurationMs: 8000,
    });

    const participantIds: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      const joined = await engine.joinStudent({
        joinCode: summary.joinCode,
        displayName: `Student ${index}`,
      });
      if (!joined.ok || joined.role !== 'student') {
        throw new Error('join failed');
      }
      engine.setParticipantConnected(joined.participantId, true);
      participantIds.push(joined.participantId);
    }

    await engine.startSession(summary.session.id, TEST_HOST.id);
    await sleep(60);
    const questionId = engine.getRoomState(summary.session.id, {
      role: 'student',
      participantId: participantIds[0] as string,
    })?.currentQuestion?.questionId as string;

    const beforeBurst = publisher.snapshots.length;
    const burst = participantIds
      .slice(0, 15)
      .map((participantId) => engine.submitAnswer(participantId, { questionId, chosenIndex: 0 }));
    expect((await Promise.all(burst)).every((ack) => ack.ok)).toBe(true);
    await sleep(450);
    const burstEmits = publisher.snapshots.length - beforeBurst;
    expect(burstEmits).toBeGreaterThanOrEqual(1);
    expect(burstEmits).toBeLessThanOrEqual(2);
    expect(
      publisher.snapshots[publisher.snapshots.length - 1]?.participants.filter(
        (p) => p.answered === 1,
      ),
    ).toHaveLength(15);

    const beforeClose = publisher.snapshots.length;
    const rest = participantIds
      .slice(15)
      .map((participantId) => engine.submitAnswer(participantId, { questionId, chosenIndex: 0 }));
    await Promise.all(rest);
    const afterClose = publisher.snapshots.slice(beforeClose);
    expect(afterClose.length).toBeGreaterThanOrEqual(1);
    expect(afterClose.some((snapshot) => snapshot.roundsCompleted === 1)).toBe(true);
    await sleep(450);
    expect(publisher.snapshots.length - beforeClose).toBeLessThanOrEqual(2);
  });
});

describe('analytics over sockets and REST', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.close();
  });

  async function playOneQuestion(options: { names: string[]; endSession: boolean }) {
    const questions = makeQuestions(2);
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions });
    const summary = await harness.createSession(quizId, 300);
    const hostSocket = await harness.connect('host-token');
    const hostSnapshots = harness.collectEvents(hostSocket, 'analytics:snapshot');
    await hostSocket.emitWithAck('room:join', { sessionId: summary.session.id });
    const students = [];
    for (const name of options.names) {
      const student = await harness.joinAsStudent(summary.joinCode, name);
      const received: string[] = [];
      (student.socket as unknown as { onAny: (listener: (event: string) => void) => void }).onAny(
        (event) => received.push(event),
      );
      students.push({ ...student, name, received });
    }

    const shownPromises = students.map((student) =>
      harness.nextEvent(student.socket, 'question:show'),
    );
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    const shown = await Promise.all(shownPromises);
    await harness.waitUntil((shown[0] as { startsAtServerMs: number }).startsAtServerMs);
    for (const [index, student] of students.entries()) {
      await student.socket.emitWithAck('answer:submit', {
        questionId: (shown[index] as { questionId: string }).questionId,
        chosenIndex:
          index % 2 === 0
            ? (questions.find((q) => q.id === (shown[index] as { questionId: string }).questionId)
                ?.correctIndex ?? 0)
            : 3,
      });
    }
    await sleep(200);
    if (options.endSession) {
      await harness.hostRequest(`/sessions/${summary.session.id}/end`);
      await sleep(100);
    }
    return { summary, hostSnapshots, students, questions };
  }

  it('sends analytics only to the host room, immediately on join and at the end', async () => {
    harness = await startLiveHarness({ analyticsThrottleMs: 100 });
    const { hostSnapshots, students } = await playOneQuestion({
      names: ['Ada', 'Bo'],
      endSession: true,
    });

    expect(hostSnapshots.length).toBeGreaterThanOrEqual(3);
    expect(hostSnapshots[0]?.status).toBe('lobby');
    const last = hostSnapshots[hostSnapshots.length - 1];
    expect(last?.status).toBe('ended');
    expect(last?.participants.map((participant) => participant.displayName).sort()).toEqual([
      'Ada',
      'Bo',
    ]);
    for (const student of students) {
      expect(student.received.length).toBeGreaterThan(0);
      expect(student.received.filter((event) => event.startsWith('analytics'))).toEqual([]);
    }
  });

  it('stores the final snapshot exactly once and serves it to the owner and an admin', async () => {
    harness = await startLiveHarness();
    const { summary } = await playOneQuestion({ names: ['Ada', 'Bo'], endSession: true });
    await harness.hostRequest(`/sessions/${summary.session.id}/end`);

    expect(harness.repository.summaryWriteCount).toBe(1);

    const ownerResponse = await harness.request(`/sessions/${summary.session.id}/summary`);
    expect(ownerResponse.status).toBe(200);
    const stored = (await ownerResponse.json()) as AnalyticsSnapshot;
    expect(stored.status).toBe('ended');
    expect(stored.source).toBe('live');
    expect(stored.questions[0]?.medianResponseMs).not.toBeNull();
    expect(stored.participants).toHaveLength(2);

    const adminResponse = await harness.request(
      `/sessions/${summary.session.id}/summary`,
      'admin-token',
    );
    expect(adminResponse.status).toBe(200);
  });

  it('returns 403 to a non-owner host and a student, 404 for a missing session, 400 for a bad id', async () => {
    harness = await startLiveHarness();
    const { summary } = await playOneQuestion({ names: ['Ada'], endSession: true });
    const id = summary.session.id;

    expect((await harness.request(`/sessions/${id}/summary`, 'other-host-token')).status).toBe(403);
    expect((await harness.request(`/sessions/${id}/summary`, 'student-token')).status).toBe(403);
    expect((await harness.request(`/sessions/${id}/summary`, 'bad-token')).status).toBe(401);
    expect((await harness.request(`/sessions/${randomUUID()}/summary`)).status).toBe(404);
    expect((await harness.request('/sessions/not-a-uuid/summary')).status).toBe(400);

    for (const type of ['participants', 'responses']) {
      expect(
        (await harness.request(`/sessions/${id}/export.csv?type=${type}`, 'other-host-token'))
          .status,
      ).toBe(403);
      expect(
        (await harness.request(`/sessions/${id}/export.csv?type=${type}`, 'student-token')).status,
      ).toBe(403);
    }
    expect(
      (await harness.request(`/sessions/${randomUUID()}/export.csv?type=participants`)).status,
    ).toBe(404);
    expect((await harness.request(`/sessions/${id}/export.csv?type=nope`)).status).toBe(400);
    expect((await harness.request(`/sessions/${id}/export.csv`)).status).toBe(400);
  });

  it('exports both CSVs with escaping and spreadsheet-injection protection', async () => {
    harness = await startLiveHarness();
    const { summary } = await playOneQuestion({ names: ['=SUM(1,2)', 'Bo'], endSession: true });
    const id = summary.session.id;

    const participants = await harness.request(`/sessions/${id}/export.csv?type=participants`);
    expect(participants.status).toBe(200);
    expect(participants.headers.get('content-type')).toContain('text/csv');
    expect(participants.headers.get('content-disposition')).toContain('attachment');
    const participantsCsv = await participants.text();
    const participantLines = participantsCsv.trim().split('\r\n');
    const participantHeader = (participantLines[0] ?? '').split(',');
    expect(participantHeader.slice(0, 7)).toEqual([
      'Rank',
      'Name',
      'Final score',
      'Answered',
      'Correct',
      'Accuracy',
      'Avg response ms',
    ]);
    expect(participantHeader.slice(7).sort()).toEqual(['Mastery: Algebra', 'Mastery: Geometry']);
    expect(participantLines).toHaveLength(3);
    expect(participantsCsv).toContain(`"'=SUM(1,2)"`);

    const responses = await harness.request(`/sessions/${id}/export.csv?type=responses`);
    expect(responses.status).toBe(200);
    const responsesCsv = await responses.text();
    const responseLines = responsesCsv.trim().split('\r\n');
    expect(responseLines[0]).toBe(
      'Participant,Question,Topic,Labeled difficulty,Chosen option,Correct,Response ms,Points,Participant Elo before,Question Elo before',
    );
    expect(responseLines).toHaveLength(3);
    expect(responsesCsv).toContain(`"'=SUM(1,2)"`);
    expect(responsesCsv).not.toMatch(/(^|\r\n)=SUM/);
  });

  it('rebuilds the summary from the responses when nothing is stored and the session is gone', async () => {
    harness = await startLiveHarness({ endedSessionRetentionMs: 30 });
    const { summary } = await playOneQuestion({ names: ['Ada', 'Bo'], endSession: true });
    const id = summary.session.id;
    const stored = (await (
      await harness.request(`/sessions/${id}/summary`)
    ).json()) as AnalyticsSnapshot;

    harness.repository.storedSummaries.clear();
    await sleep(120);
    const rebuiltResponse = await harness.request(`/sessions/${id}/summary`);
    expect(rebuiltResponse.status).toBe(200);
    const rebuilt = (await rebuiltResponse.json()) as AnalyticsSnapshot;

    expect(rebuilt.source).toBe('rebuilt');
    expect(rebuilt.totalRounds).toBeNull();
    for (const participant of rebuilt.participants) {
      const original = stored.participants.find(
        (candidate) => candidate.participantId === participant.participantId,
      );
      expect(participant.score).toBe(original?.score);
      expect(participant.answered).toBe(original?.answered);
      expect(participant.rank).toBe(original?.rank);
    }
    expect(rebuilt.questions[0]?.answered).toBe(stored.questions[0]?.answered);
    expect(harness.repository.storedSummaries.has(id)).toBe(true);
    const again = (await (
      await harness.request(`/sessions/${id}/summary`)
    ).json()) as AnalyticsSnapshot;
    expect(again.source).toBe('rebuilt');
    expect(again.generatedAtMs).toBe(rebuilt.generatedAtMs);
    expect(rebuilt.leaderboard.map((entry) => entry.participantId)).toEqual(
      stored.leaderboard.map((entry) => entry.participantId),
    );
  });
});

export type { SessionSummary };
