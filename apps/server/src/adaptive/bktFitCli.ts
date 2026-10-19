import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  BKT_FIT_MIN_SEQUENCES,
  DEFAULT_BKT_PARAMS,
  createSeededRandom,
  fitBkt,
  generateBktSequences,
  normalizeTopicKey,
  type BktFitResult,
  type BktParams,
  type BktSequence,
} from '@quizup/shared';

const SYNTHETIC_TOLERANCE = 0.06;
const SYNTHETIC_SEQUENCES = 2000;
const SYNTHETIC_LENGTH = 8;
const SYNTHETIC_SEED = 20261019;

const fileSchema = z.union([
  z.array(z.object({ topic: z.string(), correct: z.array(z.boolean()) })),
  z.object({ sequences: z.array(z.object({ topic: z.string(), correct: z.array(z.boolean()) })) }),
]);

type TopicSequences = Map<string, BktSequence[]>;

function formatParams(params: BktParams): string {
  return [params.pInit, params.pLearn, params.pSlip, params.pGuess]
    .map((value) => value.toFixed(3).padStart(7))
    .join(' ');
}

function printReport(byTopic: TopicSequences) {
  console.log(
    `${'topic'.padEnd(18)} ${'seqs'.padStart(6)} ${'obs'.padStart(7)}  ${'p_init'.padStart(7)} ${'p_learn'.padStart(7)} ${'p_slip'.padStart(7)} ${'p_guess'.padStart(7)}  ll/obs default -> fitted`,
  );
  console.log(
    `${'defaults'.padEnd(18)} ${''.padStart(6)} ${''.padStart(7)}  ${formatParams(DEFAULT_BKT_PARAMS)}`,
  );
  for (const [topic, sequences] of [...byTopic].sort(([a], [b]) => a.localeCompare(b))) {
    const result = fitBkt(sequences);
    console.log(
      `${topic.padEnd(18)} ${String(result.sequences).padStart(6)} ${String(result.observations).padStart(7)}  ${formatParams(result.params)}  ${result.defaultLogLikelihoodPerObservation.toFixed(4)} -> ${result.logLikelihoodPerObservation.toFixed(4)}`,
    );
    if (!result.fitted && result.reason) {
      console.log(
        `  ${topic}: ${result.reason} (needs at least ${BKT_FIT_MIN_SEQUENCES} sequences)`,
      );
    }
  }
}

async function loadFromDatabase(): Promise<TopicSequences> {
  const { supabaseAdmin } = await import('../supabaseAdmin.js');
  const pageSize = 1000;
  const rows: {
    participant_id: string;
    question_id: string;
    correct: boolean;
    answered_at: string;
  }[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('responses')
      .select('participant_id, question_id, correct, answered_at')
      .not('participant_elo_before', 'is', null)
      .order('answered_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) {
      break;
    }
  }

  const topicByQuestion = new Map<string, string>();
  const questionIds = [...new Set(rows.map((row) => row.question_id))];
  for (let index = 0; index < questionIds.length; index += 200) {
    const { data, error } = await supabaseAdmin
      .from('questions')
      .select('id, topic')
      .in('id', questionIds.slice(index, index + 200));
    if (error) {
      throw new Error(error.message);
    }
    for (const question of data ?? []) {
      topicByQuestion.set(question.id as string, normalizeTopicKey(question.topic as string));
    }
  }

  const sequencesByKey = new Map<string, { topic: string; correct: boolean[] }>();
  for (const row of rows) {
    const topic = topicByQuestion.get(row.question_id);
    if (!topic) {
      continue;
    }
    const key = `${row.participant_id}|${topic}`;
    const entry = sequencesByKey.get(key) ?? { topic, correct: [] };
    entry.correct.push(row.correct);
    sequencesByKey.set(key, entry);
  }
  const byTopic: TopicSequences = new Map();
  for (const { topic, correct } of sequencesByKey.values()) {
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), correct]);
  }
  return byTopic;
}

function loadFromFile(path: string): TopicSequences {
  const parsed = fileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const list = Array.isArray(parsed) ? parsed : parsed.sequences;
  const byTopic: TopicSequences = new Map();
  for (const { topic, correct } of list) {
    const key = normalizeTopicKey(topic);
    byTopic.set(key, [...(byTopic.get(key) ?? []), correct]);
  }
  return byTopic;
}

function runSynthetic(): boolean {
  console.log(
    'bkt:fit synthetic recovery - SIMULATED data, nothing is read from or written to the app.',
  );
  console.log(
    `method: pattern search over the sequence log-likelihood (5 starting points), slip and guess at most 0.3, slip + guess below 0.6, minimum ${BKT_FIT_MIN_SEQUENCES} sequences per topic.`,
  );
  console.log(
    `${SYNTHETIC_SEQUENCES} sequences of length ${SYNTHETIC_LENGTH} per topic, seed ${SYNTHETIC_SEED}, tolerance ${SYNTHETIC_TOLERANCE} on every parameter.\n`,
  );

  const truths: { topic: string; truth: BktParams }[] = [
    { topic: 'topic A', truth: { pInit: 0.5, pLearn: 0.25, pSlip: 0.15, pGuess: 0.1 } },
    { topic: 'topic B', truth: { pInit: 0.15, pLearn: 0.08, pSlip: 0.05, pGuess: 0.25 } },
    { topic: 'topic C', truth: { pInit: 0.4, pLearn: 0.3, pSlip: 0.2, pGuess: 0.15 } },
  ];
  const random = createSeededRandom(SYNTHETIC_SEED);
  let passed = true;
  console.log(
    `${'topic'.padEnd(10)} ${'param'.padEnd(8)} ${'true'.padStart(7)} ${'fitted'.padStart(7)} ${'error'.padStart(7)}`,
  );
  for (const { topic, truth } of truths) {
    const result: BktFitResult = fitBkt(
      generateBktSequences(truth, SYNTHETIC_SEQUENCES, SYNTHETIC_LENGTH, random),
    );
    for (const key of ['pInit', 'pLearn', 'pSlip', 'pGuess'] as const) {
      const error = result.params[key] - truth[key];
      if (Math.abs(error) > SYNTHETIC_TOLERANCE) {
        passed = false;
      }
      console.log(
        `${topic.padEnd(10)} ${key.padEnd(8)} ${truth[key].toFixed(3).padStart(7)} ${result.params[key].toFixed(3).padStart(7)} ${error.toFixed(3).padStart(7)}`,
      );
    }
  }

  const small = fitBkt(
    generateBktSequences(truths[0]?.truth ?? DEFAULT_BKT_PARAMS, 12, SYNTHETIC_LENGTH, random),
  );
  console.log(
    `\ntopic D (12 sequences): ${small.reason ?? 'fitted'}; output ${formatParams(small.params)} (defaults)`,
  );
  console.log(`\nresult: ${passed ? 'PASS' : 'FAIL'} (all errors within ${SYNTHETIC_TOLERANCE})`);
  return passed;
}

const args = process.argv.slice(2);
if (args.includes('--synthetic')) {
  process.exit(runSynthetic() ? 0 : 1);
}

const fileIndex = args.indexOf('--file');
const filePath =
  fileIndex === -1 ? args.find((argument) => !argument.startsWith('--')) : args[fileIndex + 1];
const byTopic = filePath ? loadFromFile(filePath) : await loadFromDatabase();

console.log('bkt:fit report - nothing is written to the app.');
console.log(`source: ${filePath ?? 'database (live session responses with rating snapshots)'}\n`);
if (byTopic.size === 0) {
  console.log('insufficient data, keeping defaults');
  console.log(`defaults ${formatParams(DEFAULT_BKT_PARAMS)}`);
} else {
  printReport(byTopic);
}
