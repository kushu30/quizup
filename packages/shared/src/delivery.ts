import { z } from 'zod';
import type { ExamOrders } from './exam.js';
import { createSeededRandom, shuffleInPlace, type RandomSource } from './sampling.js';
import { QUESTION_OPTION_COUNT } from './tables.js';

export const MAX_POOL_RULES = 20;
export const MAX_POOL_COUNT = 500;
const POOL_SEED_SALT = 0x9e3779b9;

export const poolRuleSchema = z.object({
  module: z.string().trim().min(1).max(80),
  count: z.number().int().min(1).max(MAX_POOL_COUNT),
});
export type PoolRule = z.infer<typeof poolRuleSchema>;

export const poolRulesSchema = z
  .array(poolRuleSchema)
  .max(MAX_POOL_RULES)
  .refine(
    (rules) => new Set(rules.map((rule) => rule.module.toLowerCase())).size === rules.length,
    'Each module can have one rule',
  );

export interface DeliverySettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  pools: PoolRule[];
}

export interface PoolableQuestion {
  id: string;
  topic: string;
}

function ruleFor(rules: readonly PoolRule[], topic: string): PoolRule | undefined {
  return rules.find((rule) => rule.module.toLowerCase() === topic.toLowerCase());
}

export function selectQuestionIds(
  questions: readonly PoolableQuestion[],
  pools: readonly PoolRule[],
  random: RandomSource,
): string[] {
  if (pools.length === 0) {
    return questions.map((question) => question.id);
  }
  const kept = new Set<string>();
  const byRule = new Map<PoolRule, string[]>();
  for (const question of questions) {
    const rule = ruleFor(pools, question.topic);
    if (rule) {
      byRule.set(rule, [...(byRule.get(rule) ?? []), question.id]);
    } else {
      kept.add(question.id);
    }
  }
  for (const [rule, ids] of byRule) {
    const drawn = ids.length <= rule.count ? ids : shuffleInPlace([...ids], () => random.next());
    for (const id of drawn.slice(0, rule.count)) {
      kept.add(id);
    }
  }
  return questions.filter((question) => kept.has(question.id)).map((question) => question.id);
}

export function perStudentQuestionCount(
  questions: readonly PoolableQuestion[],
  pools: readonly PoolRule[],
): number {
  return selectQuestionIds(questions, pools, createSeededRandom(1)).length;
}

export function buildAttemptOrders(
  seed: number,
  questions: readonly PoolableQuestion[],
  delivery: DeliverySettings,
  optionCount: number = QUESTION_OPTION_COUNT,
): ExamOrders {
  const ids = selectQuestionIds(
    questions,
    delivery.pools,
    createSeededRandom((seed ^ POOL_SEED_SALT) >>> 0),
  );
  const random = createSeededRandom(seed);
  const next = () => random.next();
  const questionOrder = delivery.shuffleQuestions ? shuffleInPlace([...ids], next) : [...ids];
  const optionOrders: Record<string, number[]> = {};
  for (const id of ids) {
    const identity = Array.from({ length: optionCount }, (_, index) => index);
    optionOrders[id] = delivery.shuffleOptions ? shuffleInPlace(identity, next) : identity;
  }
  return { questionOrder, optionOrders };
}
