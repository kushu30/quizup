import { describe, expect, it } from 'vitest';
import { quizSettingsSchema } from './adaptive.js';
import {
  buildAttemptOrders,
  perStudentQuestionCount,
  poolRulesSchema,
  selectQuestionIds,
} from './delivery.js';
import { buildExamOrders } from './exam.js';
import { createSeededRandom } from './sampling.js';

const QUESTIONS = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `a${n}`, topic: 'Module 1' })),
  ...[1, 2, 3, 4].map((n) => ({ id: `b${n}`, topic: 'Module 2' })),
  { id: 'c1', topic: 'Unsorted' },
];
const IDS = QUESTIONS.map((question) => question.id);

describe('selectQuestionIds', () => {
  it('keeps every question when there are no pool rules', () => {
    expect(selectQuestionIds(QUESTIONS, [], createSeededRandom(1))).toEqual(IDS);
  });

  it('draws the asked number from a module and keeps all questions of other modules', () => {
    const chosen = selectQuestionIds(
      QUESTIONS,
      [{ module: 'Module 1', count: 2 }],
      createSeededRandom(7),
    );
    expect(chosen.filter((id) => id.startsWith('a'))).toHaveLength(2);
    expect(chosen.filter((id) => id.startsWith('b'))).toHaveLength(4);
    expect(chosen).toContain('c1');
  });

  it('keeps the host’s order among the questions it chooses', () => {
    const chosen = selectQuestionIds(
      QUESTIONS,
      [{ module: 'Module 1', count: 3 }],
      createSeededRandom(3),
    );
    expect(chosen).toEqual(IDS.filter((id) => chosen.includes(id)));
  });

  it('gives the same draw for the same seed and different draws across seeds', () => {
    const rule = [{ module: 'Module 1', count: 2 }];
    const draw = (seed: number) => selectQuestionIds(QUESTIONS, rule, createSeededRandom(seed));
    expect(draw(5)).toEqual(draw(5));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => draw(seed).join())).size).toBeGreaterThan(
      1,
    );
  });

  it('takes everything when asked for more than the module holds, and ignores unknown modules', () => {
    const chosen = selectQuestionIds(
      QUESTIONS,
      [
        { module: 'Module 2', count: 99 },
        { module: 'Nope', count: 3 },
      ],
      createSeededRandom(1),
    );
    expect(chosen).toEqual(IDS);
  });
});

describe('perStudentQuestionCount', () => {
  it('adds the questions always included to what each rule draws', () => {
    expect(perStudentQuestionCount(QUESTIONS, [{ module: 'Module 1', count: 2 }])).toBe(7);
    expect(perStudentQuestionCount(QUESTIONS, [{ module: 'Module 2', count: 99 }])).toBe(11);
    expect(perStudentQuestionCount(QUESTIONS, [])).toBe(11);
  });
});

describe('buildAttemptOrders', () => {
  const both = { shuffleQuestions: true, shuffleOptions: true, pools: [] };

  it('matches the long-standing exam shuffle when both shuffles are on and there are no pools', () => {
    expect(buildAttemptOrders(12345, QUESTIONS, both)).toEqual(buildExamOrders(12345, IDS));
  });

  it('keeps the host’s order when question shuffling is off', () => {
    const orders = buildAttemptOrders(9, QUESTIONS, { ...both, shuffleQuestions: false });
    expect(orders.questionOrder).toEqual(IDS);
  });

  it('shows options in their original order when option shuffling is off', () => {
    const orders = buildAttemptOrders(9, QUESTIONS, { ...both, shuffleOptions: false });
    for (const id of IDS) {
      expect(orders.optionOrders[id]).toEqual([0, 1, 2, 3]);
    }
  });

  it('only orders the questions that were drawn', () => {
    const orders = buildAttemptOrders(4, QUESTIONS, {
      ...both,
      pools: [{ module: 'Module 1', count: 2 }],
    });
    expect(orders.questionOrder).toHaveLength(7);
    expect(Object.keys(orders.optionOrders).sort()).toEqual([...orders.questionOrder].sort());
  });
});

describe('poolRulesSchema', () => {
  it('accepts rules with a module and a count', () => {
    expect(poolRulesSchema.parse([{ module: ' Module 1 ', count: 3 }])).toEqual([
      { module: 'Module 1', count: 3 },
    ]);
  });

  it('refuses a repeated module, a zero count and too many rules', () => {
    expect(
      poolRulesSchema.safeParse([
        { module: 'A', count: 1 },
        { module: 'a', count: 2 },
      ]).success,
    ).toBe(false);
    expect(poolRulesSchema.safeParse([{ module: 'A', count: 0 }]).success).toBe(false);
    expect(
      poolRulesSchema.safeParse(
        Array.from({ length: 21 }, (_, i) => ({ module: `M${i}`, count: 1 })),
      ).success,
    ).toBe(false);
  });
});

describe('delivery settings by assessment type', () => {
  it('shuffles questions and options for a timed exam unless told otherwise', () => {
    const exam = quizSettingsSchema.parse({ mode: 'exam', durationMinutes: 30 });
    expect(exam).toMatchObject({ shuffleQuestions: true, shuffleOptions: true, pools: [] });
    const off = quizSettingsSchema.parse({
      mode: 'exam',
      durationMinutes: 30,
      shuffleQuestions: false,
      shuffleOptions: false,
    });
    expect(off).toMatchObject({ shuffleQuestions: false, shuffleOptions: false });
  });

  it('keeps a live quiz in order, with options never shuffled', () => {
    expect(quizSettingsSchema.parse({})).toMatchObject({
      shuffleQuestions: false,
      shuffleOptions: false,
    });
    expect(
      quizSettingsSchema.parse({ shuffleQuestions: true, shuffleOptions: true }),
    ).toMatchObject({
      shuffleQuestions: true,
      shuffleOptions: false,
    });
  });

  it('ignores shuffling and pools for an adaptive quiz', () => {
    expect(
      quizSettingsSchema.parse({
        adaptive: true,
        shuffleQuestions: true,
        pools: [{ module: 'A', count: 1 }],
      }),
    ).toMatchObject({ shuffleQuestions: false, shuffleOptions: false, pools: [] });
  });

  it('keeps pools for live and exam quizzes', () => {
    const pools = [{ module: 'A', count: 2 }];
    expect(quizSettingsSchema.parse({ pools }).pools).toEqual(pools);
    expect(quizSettingsSchema.parse({ mode: 'exam', durationMinutes: 5, pools }).pools).toEqual(
      pools,
    );
  });
});
