import {
  EVAL_ABILITY_MEAN,
  EVAL_ABILITY_SD,
  EVAL_DIFFICULTY_NOISE_SD,
  SAMPLING_SIGMA,
  STUDENT_MODEL_SCALE,
  defaultEvalConfig,
  describeWhereAdaptiveDoesNotWin,
  runAdaptiveEvaluation,
  verdictFor,
  type EvalCell,
} from '@quizup/shared';

function argumentValue(name: string): number | undefined {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : Number(process.argv[index + 1]);
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

const config = defaultEvalConfig({
  ...(argumentValue('--students') !== undefined
    ? { students: argumentValue('--students') as number }
    : {}),
  ...(argumentValue('--seed') !== undefined ? { seed: argumentValue('--seed') as number } : {}),
});

console.log('adaptive:eval - SIMULATED students, not real-student evidence.');
console.log(
  `student model: P(correct) = sigmoid((ability - difficulty) / ${STUDENT_MODEL_SCALE.toFixed(1)}), ability ~ N(${EVAL_ABILITY_MEAN}, ${EVAL_ABILITY_SD}), true difficulty = label (800/1000/1200) + N(0, ${EVAL_DIFFICULTY_NOISE_SD}).`,
);
console.log(
  `${config.students} students per pool size, seed ${config.seed}, pools ${config.poolSizes.join('/')}, sigma sweep ${config.sigmas.join('/')} (production: ${SAMPLING_SIGMA}), ${config.bootstrapResamples} bootstrap resamples (paired, 95% interval).`,
);
console.log(
  'Both arms see the same students, the same questions and the same random draws per question. Question ratings stay at their label (no cross-student drift). Selection uses the production selectNextAdaptiveQuestion code.\n',
);

const { cells, baselines } = runAdaptiveEvaluation(config);

for (const baseline of baselines) {
  console.log(
    `pool ${String(baseline.poolSize).padStart(3)}: predicting 1000 for everyone has RMSE ${baseline.rmse.toFixed(1)}`,
  );
}
console.log('');

const header = `${'pool'.padStart(4)} ${'arm'.padEnd(14)} ${'k'.padStart(2)} ${'RMSE'.padStart(7)} ${'Spearman'.padStart(8)}  ${'RMSE diff vs fixed [95% CI]'.padEnd(30)} verdict`;
console.log(header);
console.log('-'.repeat(header.length + 10));

function formatCell(cell: EvalCell): string {
  const arm = cell.arm === 'fixed' ? 'fixed order' : `adaptive s=${cell.sigma}`;
  const difference =
    cell.deltaRmse === null
      ? ''
      : `${cell.deltaRmse.toFixed(1).padStart(6)} [${(cell.deltaRmseLow as number).toFixed(1)}, ${(cell.deltaRmseHigh as number).toFixed(1)}]`;
  return `${String(cell.poolSize).padStart(4)} ${arm.padEnd(14)} ${String(cell.answered).padStart(2)} ${cell.rmse.toFixed(1).padStart(7)} ${cell.spearman.toFixed(3).padStart(8)}  ${difference.padEnd(30)} ${verdictFor(cell) ?? ''}`;
}

for (const cell of cells) {
  console.log(formatCell(cell));
}

const adaptiveCells = cells.filter((cell) => cell.arm === 'adaptive');
const verdictCounts = new Map<string, number>();
for (const cell of adaptiveCells) {
  const verdict = verdictFor(cell) ?? 'n/a';
  verdictCounts.set(verdict, (verdictCounts.get(verdict) ?? 0) + 1);
}
console.log(
  `\nacross all ${adaptiveCells.length} adaptive cells: ${[...verdictCounts].map(([verdict, count]) => `${count} ${verdict}`).join(', ')}`,
);
const notBetter = describeWhereAdaptiveDoesNotWin(cells);
console.log(
  `\nWhere production adaptive (sigma ${SAMPLING_SIGMA}) does NOT beat fixed order: ${notBetter.length === 0 ? 'nowhere in this run' : `${notBetter.length} of ${config.poolSizes.length * config.checkpoints.length} cells`}`,
);
for (const line of notBetter) {
  console.log(`  ${line}`);
}
const spearmanLower = cells.filter(
  (cell) =>
    cell.arm === 'adaptive' && cell.sigma === SAMPLING_SIGMA && (cell.deltaSpearman ?? 0) < 0,
);
console.log(
  `Spearman is lower than fixed order in ${spearmanLower.length} sigma ${SAMPLING_SIGMA} cells${spearmanLower.length ? `: ${spearmanLower.map((cell) => `pool ${cell.poolSize} k=${cell.answered}`).join(', ')}` : ''}.`,
);
console.log(
  `Absolute errors are large for both arms because Elo with K=32 starts at 1000 and moves at most about 16 points per answer, so after 10 answers it has not caught up with abilities spread over +/-${EVAL_ABILITY_SD}.`,
);
