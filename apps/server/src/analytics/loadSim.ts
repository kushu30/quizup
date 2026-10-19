import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import type { AnalyticsSnapshot } from '@quizup/shared';

process.env['PORT'] ??= '4999';
process.env['CORS_ORIGINS'] ??= 'http://localhost:5173';
process.env['SUPABASE_URL'] ??= 'http://127.0.0.1:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'load-sim-unused';

const { TEST_HOST, sleep, startLiveHarness } = await import('../live/liveHarness.testkit.js');

const STUDENT_COUNT = 20;
const P95_LIMIT_MS = 500;
const SPREAD_ROUNDS = 3;
const SPREAD_DURATION_MS = 3000;
const BURST_DURATION_MS = 5000;
const BURST_WINDOW_MS = 1000;
const START_DELAY_MS = 150;

interface PendingAnswer {
  participantId: string;
  round: number;
  emittedAt: number;
}

interface ScenarioResult {
  name: string;
  answers: number;
  snapshots: number;
  latenciesMs: number[];
  cpuMsPerAnswer: number;
}

function percentile(sortedValues: number[], fraction: number): number {
  if (sortedValues.length === 0) {
    return Number.NaN;
  }
  const index = Math.min(sortedValues.length - 1, Math.ceil(fraction * sortedValues.length) - 1);
  return sortedValues[Math.max(index, 0)] as number;
}

async function runScenario(options: {
  name: string;
  rounds: number;
  durationMs: number;
  answerWindowMs: number;
}): Promise<ScenarioResult> {
  const harness = await startLiveHarness({ startDelayMs: START_DELAY_MS });
  try {
    const questions = Array.from({ length: options.rounds }, (_, index) => ({
      id: randomUUID(),
      stem: `Simulated question ${index + 1}`,
      options: ['a', 'b', 'c', 'd'],
      correctIndex: index % 4,
      topic: index % 2 === 0 ? 'Algebra' : 'Geometry',
    }));
    const quizId = harness.repository.seedQuiz({ hostId: TEST_HOST.id, questions });
    const summary = await harness.createSession(quizId, options.durationMs);

    const hostSocket = await harness.connect('host-token');
    const pending: PendingAnswer[] = [];
    const latenciesMs: number[] = [];
    let snapshotCount = 0;
    hostSocket.on('analytics:snapshot', (snapshot: AnalyticsSnapshot) => {
      const receivedAt = performance.now();
      snapshotCount += 1;
      const answeredById = new Map(
        snapshot.participants.map((participant) => [
          participant.participantId,
          participant.answered,
        ]),
      );
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const answer = pending[index] as PendingAnswer;
        if ((answeredById.get(answer.participantId) ?? 0) >= answer.round) {
          latenciesMs.push(receivedAt - answer.emittedAt);
          pending.splice(index, 1);
        }
      }
    });
    await hostSocket.emitWithAck('room:join', { sessionId: summary.session.id });

    const students = [];
    for (let index = 0; index < STUDENT_COUNT; index += 1) {
      students.push(await harness.joinAsStudent(summary.joinCode, `Simulated ${index + 1}`));
    }
    const leader = students[0];
    if (!leader) {
      throw new Error('no students');
    }

    let answers = 0;
    let upcomingShow = harness.nextEvent(leader.socket, 'question:show');
    await harness.hostRequest(`/sessions/${summary.session.id}/start`);
    const cpuStart = process.cpuUsage();

    for (let round = 1; round <= options.rounds; round += 1) {
      const shown = await upcomingShow;
      const result = harness.nextEvent(leader.socket, 'question:result', 15_000);
      await harness.waitUntil(shown.startsAtServerMs);

      await Promise.all(
        students.map(async (student) => {
          await sleep(Math.random() * options.answerWindowMs);
          pending.push({
            participantId: student.participantId,
            round,
            emittedAt: performance.now(),
          });
          answers += 1;
          await student.socket.emitWithAck('answer:submit', {
            questionId: shown.questionId,
            chosenIndex: Math.floor(Math.random() * 4),
          });
        }),
      );
      await result;
      await sleep(100);
      if (round < options.rounds) {
        upcomingShow = harness.nextEvent(leader.socket, 'question:show');
      }
      await harness.hostRequest(`/sessions/${summary.session.id}/next`);
    }

    await sleep(400);
    const cpu = process.cpuUsage(cpuStart);
    return {
      name: options.name,
      answers,
      snapshots: snapshotCount,
      latenciesMs: latenciesMs.sort((first, second) => first - second),
      cpuMsPerAnswer: (cpu.user + cpu.system) / 1000 / Math.max(answers, 1),
    };
  } finally {
    await harness.close();
  }
}

function report(result: ScenarioResult): boolean {
  const p50 = percentile(result.latenciesMs, 0.5);
  const p95 = percentile(result.latenciesMs, 0.95);
  const max = result.latenciesMs[result.latenciesMs.length - 1] ?? Number.NaN;
  const measured = result.latenciesMs.length;
  console.log(`scenario: ${result.name}`);
  console.log(`  simulated students     : ${STUDENT_COUNT}`);
  console.log(`  answers                : ${result.answers} (latency measured for ${measured})`);
  console.log(`  analytics snapshots    : ${result.snapshots}`);
  console.log(
    `  latency p50 / p95 / max: ${p50.toFixed(1)} / ${p95.toFixed(1)} / ${max.toFixed(1)} ms`,
  );
  console.log(`  CPU per answer         : ${result.cpuMsPerAnswer.toFixed(2)} ms (whole process)`);
  return measured === result.answers && p95 <= P95_LIMIT_MS;
}

console.log('load:sim - SIMULATED local in-process load, not a production benchmark.');
console.log('The server and all simulated clients share one Node process, so CPU includes both.\n');

const spread = await runScenario({
  name: `spread, ${SPREAD_ROUNDS} rounds, answers at random delays across ${SPREAD_DURATION_MS} ms`,
  rounds: SPREAD_ROUNDS,
  durationMs: SPREAD_DURATION_MS,
  answerWindowMs: SPREAD_DURATION_MS * 0.9,
});
const spreadPassed = report(spread);

console.log('');
const burst = await runScenario({
  name: `burst, 1 round, all answers within ${BURST_WINDOW_MS} ms`,
  rounds: 1,
  durationMs: BURST_DURATION_MS,
  answerWindowMs: BURST_WINDOW_MS,
});
const burstPassed = report(burst);

const passed = spreadPassed && burstPassed;
console.log(`\nresult: ${passed ? 'PASS' : 'FAIL'} (p95 limit ${P95_LIMIT_MS} ms)`);
process.exit(passed ? 0 : 1);
