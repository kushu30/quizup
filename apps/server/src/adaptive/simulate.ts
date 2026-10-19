import { runAdaptiveSimulation, type SimulatedStudentResult } from '@quizup/shared';

const DEMO_SEED = 2;
const AGGREGATE_SEEDS = 200;
const ROUNDS = 10;
const STRONG_ABILITY = 1400;
const WEAK_ABILITY = 600;

function simulate(seed: number): [SimulatedStudentResult, SimulatedStudentResult] {
  const [strong, weak] = runAdaptiveSimulation({
    students: [
      { name: 'strong', ability: STRONG_ABILITY, seed },
      { name: 'weak', ability: WEAK_ABILITY, seed: seed + 1000 },
    ],
    rounds: ROUNDS,
  });
  return [strong as SimulatedStudentResult, weak as SimulatedStudentResult];
}

function meanServedRating(result: SimulatedStudentResult): number {
  return result.steps.reduce((sum, step) => sum + step.questionRating, 0) / result.steps.length;
}

function printStudent(result: SimulatedStudentResult) {
  console.log(`\n${result.name} (ability ${result.ability})`);
  console.log(`  difficulty : ${result.steps.map((step) => step.difficulty.padEnd(6)).join(' ')}`);
  console.log(
    `  question   : ${result.steps.map((step) => String(Math.round(step.questionRating)).padEnd(6)).join(' ')}`,
  );
  console.log(
    `  correct    : ${result.steps.map((step) => (step.correct ? 'yes   ' : 'no    ')).join(' ')}`,
  );
  console.log(
    `  rating     : ${[
      result.steps[0]?.ratingBefore ?? 1000,
      ...result.steps.map((step) => step.ratingAfter),
    ]
      .map((rating) => String(Math.round(rating)).padEnd(6))
      .join(' ')}`,
  );
  console.log(`  mean served question rating: ${meanServedRating(result).toFixed(1)}`);
}

const [strong, weak] = simulate(DEMO_SEED);
console.log(`Adaptive simulation: 30 questions, ${ROUNDS} rounds, seed ${DEMO_SEED}`);
printStudent(strong);
printStudent(weak);
console.log(
  `\nDifference in mean served question rating (strong - weak): ${(meanServedRating(strong) - meanServedRating(weak)).toFixed(1)}`,
);

let totalDifference = 0;
let strongHigher = 0;
for (let seed = 1; seed <= AGGREGATE_SEEDS; seed += 1) {
  const [seedStrong, seedWeak] = simulate(seed);
  const difference = meanServedRating(seedStrong) - meanServedRating(seedWeak);
  totalDifference += difference;
  if (difference > 0) {
    strongHigher += 1;
  }
}
console.log(
  `Across ${AGGREGATE_SEEDS} seeds: mean difference ${(totalDifference / AGGREGATE_SEEDS).toFixed(1)}, strong student served harder questions in ${((strongHigher / AGGREGATE_SEEDS) * 100).toFixed(0)}% of runs`,
);
