import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import {
  EXAM_CONSENT_VERSION,
  type ProctorEventPayload,
  type ProctorEventRecord,
} from '@quizup/shared';

process.env['PORT'] ??= '4999';
process.env['CORS_ORIGINS'] ??= 'http://localhost:5173';
process.env['SUPABASE_URL'] ??= 'http://127.0.0.1:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'proctor-sim-unused';

const { TEST_HOST, sleep, startLiveHarness } = await import('../live/liveHarness.testkit.js');

const STUDENT_COUNT = 20;
const P95_LIMIT_MS = 1000;
const PERSIST_WAIT_LIMIT_MS = 5000;
const BASE_CLIENT_AT = Date.now();

interface Sample {
  type: string;
  emittedAt: number;
  receivedAt: number | null;
  persistedAt: number | null;
}

function percentile(sortedValues: number[], fraction: number): number {
  if (sortedValues.length === 0) {
    return Number.NaN;
  }
  const index = Math.min(sortedValues.length - 1, Math.ceil(fraction * sortedValues.length) - 1);
  return sortedValues[Math.max(index, 0)] as number;
}

function summarize(values: number[]) {
  const sorted = [...values].sort((first, second) => first - second);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? Number.NaN,
  };
}

function line(label: string, values: number[]): string {
  const stats = summarize(values);
  return `  ${label.padEnd(16)} n=${String(stats.count).padStart(3)}  p50 ${stats.p50.toFixed(1).padStart(7)}  p95 ${stats.p95.toFixed(1).padStart(7)}  max ${stats.max.toFixed(1).padStart(7)} ms`;
}

function eventsFor(clientAtBase: number): ProctorEventPayload[] {
  return [
    { type: 'tab_switch', clientAt: clientAtBase + 1 },
    {
      type: 'focus_return',
      clientAt: clientAtBase + 2,
      detail: { durationMs: 1500, from: 'tab_switch' },
    },
    { type: 'window_blur', clientAt: clientAtBase + 3 },
    { type: 'fullscreen_exit', clientAt: clientAtBase + 4 },
    { type: 'copy', clientAt: clientAtBase + 5, detail: { length: 24, cut: false } },
    { type: 'paste', clientAt: clientAtBase + 6, detail: { length: 120 } },
    { type: 'right_click', clientAt: clientAtBase + 7 },
    { type: 'resize', clientAt: clientAtBase + 8, detail: { width: 1024, height: 700 } },
  ];
}

console.log('proctor:sim - SIMULATED local in-process load, not a production benchmark.');
console.log('The server and all simulated clients share one Node process.\n');

const harness = await startLiveHarness();
try {
  const questions = Array.from({ length: 5 }, (_, index) => ({
    id: randomUUID(),
    stem: `Simulated question ${index + 1}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: index % 4,
    topic: 'Algebra',
  }));
  const quizId = harness.repository.seedQuiz({
    hostId: TEST_HOST.id,
    settings: { mode: 'exam', durationMinutes: 30 },
    questions,
  });
  const summary = await harness.createSession(quizId, 20_000);

  const samples = new Map<string, Sample>();
  const hostSocket = await harness.connect('host-token');
  hostSocket.on('proctor:timeline', (record: ProctorEventRecord) => {
    const sample = samples.get(`${record.participantId}:${record.clientAt}`);
    if (sample && sample.receivedAt === null) {
      sample.receivedAt = performance.now();
    }
  });
  await hostSocket.emitWithAck('room:join', { sessionId: summary.session.id });

  const students = [];
  for (let index = 0; index < STUDENT_COUNT; index += 1) {
    students.push(await harness.joinAsStudent(summary.joinCode, `Simulated ${index + 1}`));
  }
  await harness.hostRequest(`/sessions/${summary.session.id}/start`);
  await sleep(50);
  for (const student of students) {
    const ack = await student.socket.emitWithAck('exam:start', {
      consentVersion: EXAM_CONSENT_VERSION,
    });
    if (!ack.ok) {
      throw new Error(`exam start failed: ${ack.error}`);
    }
  }
  await harness.exam.flushProctor();

  let observedPersisted = harness.repository.proctorEvents.length;
  const persistPoller = setInterval(() => {
    const now = performance.now();
    const events = harness.repository.proctorEvents;
    for (; observedPersisted < events.length; observedPersisted += 1) {
      const event = events[observedPersisted] as ProctorEventRecord;
      const sample = samples.get(`${event.participantId}:${event.clientAt}`);
      if (sample && sample.persistedAt === null) {
        sample.persistedAt = now;
      }
    }
  }, 2);

  await Promise.all(
    students.map(async (student, studentIndex) => {
      for (const event of eventsFor(BASE_CLIENT_AT + studentIndex * 100)) {
        const key = `${student.participantId}:${event.clientAt}`;
        samples.set(key, {
          type: event.type,
          emittedAt: performance.now(),
          receivedAt: null,
          persistedAt: null,
        });
        const ack = await student.socket.emitWithAck('proctor:event', event);
        if (!ack.ok && ack.error !== 'rate_limited') {
          throw new Error(`event rejected: ${ack.error}`);
        }
        await sleep(Math.random() * 20);
      }
    }),
  );

  const waitStart = performance.now();
  while (
    performance.now() - waitStart < PERSIST_WAIT_LIMIT_MS &&
    [...samples.values()].some(
      (sample) => sample.persistedAt === null || sample.receivedAt === null,
    )
  ) {
    await sleep(10);
  }
  clearInterval(persistPoller);

  const all = [...samples.values()];
  const delivered = all.filter(
    (sample) => sample.receivedAt !== null && sample.persistedAt !== null,
  );
  const timelineLatencies = (type?: string) =>
    delivered
      .filter((sample) => type === undefined || sample.type === type)
      .map((sample) => (sample.receivedAt as number) - sample.emittedAt);
  const persistLatencies = (type?: string) =>
    delivered
      .filter((sample) => type === undefined || sample.type === type)
      .map((sample) => (sample.persistedAt as number) - sample.emittedAt);

  const types = [...new Set(all.map((sample) => sample.type))];
  console.log(`simulated students : ${STUDENT_COUNT}`);
  console.log(`events emitted     : ${all.length}`);
  console.log(`delivered + stored : ${delivered.length}`);
  const dropped = (harness.exam.hostProgress(summary.session.id) ?? []).reduce(
    (sum, row) => sum + row.droppedEvents,
    0,
  );
  console.log(`dropped by rate cap: ${dropped}\n`);

  console.log('host receives proctor:timeline (ms after the student emits)');
  for (const type of types) {
    console.log(line(type, timelineLatencies(type)));
  }
  console.log(line('OVERALL', timelineLatencies()));

  console.log('\nrow persisted in the repository (ms after the student emits)');
  for (const type of types) {
    console.log(line(type, persistLatencies(type)));
  }
  console.log(line('OVERALL', persistLatencies()));

  const overallTimeline = summarize(timelineLatencies());
  const overallPersist = summarize(persistLatencies());
  const passed =
    delivered.length === all.length &&
    overallTimeline.p95 <= P95_LIMIT_MS &&
    overallPersist.p95 <= P95_LIMIT_MS;
  console.log(`\nresult: ${passed ? 'PASS' : 'FAIL'} (overall p95 limit ${P95_LIMIT_MS} ms)`);
  process.exitCode = passed ? 0 : 1;
} finally {
  await harness.close();
}
process.exit(process.exitCode ?? 0);
