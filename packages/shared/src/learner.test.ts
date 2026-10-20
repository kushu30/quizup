import { describe, expect, it } from 'vitest';
import { PROVISIONAL_QUESTION_ANSWERS, isProvisionalQuestion } from './learner.js';
import {
  SAMPLING_SIGMA,
  pickWeighted,
  questionWeight,
  selectNextAdaptiveQuestion,
} from './sampling.js';
import { quizSettingsSchema } from './adaptive.js';

describe('provisional questions', () => {
  it('uses a named threshold of 30 responses', () => {
    expect(PROVISIONAL_QUESTION_ANSWERS).toBe(30);
    expect(isProvisionalQuestion(0)).toBe(true);
    expect(isProvisionalQuestion(29)).toBe(true);
    expect(isProvisionalQuestion(30)).toBe(false);
    expect(isProvisionalQuestion(500)).toBe(false);
  });
});

describe('sampling width parameter', () => {
  it('leaves the default weights unchanged and widens or narrows on request', () => {
    expect(questionWeight(800, 1000)).toBeCloseTo(0.606531, 5);
    expect(questionWeight(800, 1000, SAMPLING_SIGMA)).toBe(questionWeight(800, 1000));
    expect(questionWeight(800, 1000, 100)).toBeCloseTo(Math.exp(-2), 9);
    expect(questionWeight(800, 1000, 400)).toBeCloseTo(Math.exp(-0.125), 9);
  });

  it('keeps pickWeighted draws identical with the default sigma', () => {
    const candidates = [{ rating: 800 }, { rating: 1000 }, { rating: 1200 }];
    expect(pickWeighted(candidates, 1000, { next: () => 0.3 })?.rating).toBe(1000);
    expect(pickWeighted(candidates, 1000, { next: () => 0.3 }, 200)?.rating).toBe(1000);
  });
});

describe('selectNextAdaptiveQuestion', () => {
  const pool = [
    { id: 'a', rating: 800 },
    { id: 'b', rating: 1000 },
    { id: 'c', rating: 1200 },
  ];

  it('never returns a served question and returns null when none are left', () => {
    expect(
      selectNextAdaptiveQuestion(pool, new Set(['b']), 1000, { next: () => 0.5 })?.id,
    ).not.toBe('b');
    expect(
      selectNextAdaptiveQuestion(pool, new Set(['a', 'b', 'c']), 1000, { next: () => 0.5 }),
    ).toBeNull();
  });

  it('matches pickWeighted over the unserved questions', () => {
    expect(selectNextAdaptiveQuestion(pool, new Set(), 1000, { next: () => 0.8 })?.id).toBe('c');
    expect(selectNextAdaptiveQuestion(pool, new Set(['c']), 1000, { next: () => 0.8 })?.id).toBe(
      'b',
    );
  });
});

describe('retired learner history setting', () => {
  it('still reads stored settings that contain it and drops it', () => {
    const parsed = quizSettingsSchema.parse({ adaptive: true, useLearnerHistory: false });
    expect(parsed.adaptive).toBe(true);
    expect('useLearnerHistory' in parsed).toBe(false);
  });
});
