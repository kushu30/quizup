import { describe, expect, it } from 'vitest';
import {
  createSimulationQuestions,
  runAdaptiveSimulation,
  type SimulatedStudentResult,
} from './adaptiveSimulation.js';

const STRONG_ABILITY = 1400;
const WEAK_ABILITY = 600;

function simulate(seed: number): SimulatedStudentResult[] {
  return runAdaptiveSimulation({
    students: [
      { name: 'strong', ability: STRONG_ABILITY, seed },
      { name: 'weak', ability: WEAK_ABILITY, seed: seed + 1000 },
    ],
    rounds: 10,
  });
}

function meanServedRating(result: SimulatedStudentResult): number {
  return result.steps.reduce((sum, step) => sum + step.questionRating, 0) / result.steps.length;
}

describe('adaptive simulation', () => {
  it('uses 30 questions: 10 per difficulty across 3 topics', () => {
    const questions = createSimulationQuestions();
    expect(questions).toHaveLength(30);
    for (const difficulty of ['easy', 'medium', 'hard']) {
      expect(questions.filter((question) => question.difficulty === difficulty)).toHaveLength(10);
    }
    expect(new Set(questions.map((question) => question.topic)).size).toBe(3);
  });

  it('never serves a question twice to the same student', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const student of simulate(seed)) {
        const ids = student.steps.map((step) => step.questionId);
        expect(student.steps).toHaveLength(10);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('serves harder questions to the strong student (seed 2)', () => {
    const [strong, weak] = simulate(2) as [SimulatedStudentResult, SimulatedStudentResult];
    expect(meanServedRating(strong) - meanServedRating(weak)).toBeGreaterThan(60);
    expect(strong.finalRating - weak.finalRating).toBeGreaterThan(150);
    expect(strong.steps.map((step) => step.difficulty)).not.toEqual(
      weak.steps.map((step) => step.difficulty),
    );
  });

  it('serves harder questions to the strong student on average across seeds', () => {
    let totalDifference = 0;
    let strongerCount = 0;
    const seeds = Array.from({ length: 200 }, (_, index) => index + 1);
    for (const seed of seeds) {
      const [strong, weak] = simulate(seed) as [SimulatedStudentResult, SimulatedStudentResult];
      const difference = meanServedRating(strong) - meanServedRating(weak);
      totalDifference += difference;
      if (difference > 0) {
        strongerCount += 1;
      }
      expect(strong.finalRating).toBeGreaterThan(weak.finalRating);
    }
    expect(totalDifference / seeds.length).toBeGreaterThan(35);
    expect(strongerCount / seeds.length).toBeGreaterThan(0.75);
  });

  it('is deterministic for a given seed', () => {
    expect(simulate(9)).toEqual(simulate(9));
  });

  it('keeps mastery within 0..1', () => {
    for (const student of simulate(3)) {
      for (const step of student.steps) {
        expect(step.mastery).toBeGreaterThanOrEqual(0);
        expect(step.mastery).toBeLessThanOrEqual(1);
      }
    }
  });
});
