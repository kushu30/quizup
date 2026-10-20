import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODULE,
  questionInputSchema,
  questionMoveSchema,
  questionUpdateSchema,
} from './api.js';
import { parseQuestionsCsv } from './csv.js';

const FIELDS = {
  stem: 'What is 1 + 1?',
  options: ['1', '2', '3', '4'],
  correct_index: 1,
  difficulty: 'easy' as const,
};

describe('a question without a module', () => {
  it('goes to Unsorted when the module is missing, empty or only spaces', () => {
    for (const topic of [undefined, '', '   ']) {
      const parsed = questionInputSchema.parse({ ...FIELDS, topic });
      expect(parsed.topic).toBe(DEFAULT_MODULE);
    }
    expect(DEFAULT_MODULE).toBe('Unsorted');
  });

  it('keeps a module that is given, trimmed, and still limits its length', () => {
    expect(questionInputSchema.parse({ ...FIELDS, topic: '  Module 1 ' }).topic).toBe('Module 1');
    expect(questionInputSchema.safeParse({ ...FIELDS, topic: 'x'.repeat(81) }).success).toBe(false);
  });

  it('leaves the module alone when an update does not mention it', () => {
    expect(questionUpdateSchema.parse({ stem: 'New text' })).toEqual({ stem: 'New text' });
  });

  it('refuses to blank the module through an update', () => {
    expect(questionUpdateSchema.safeParse({ topic: '  ' }).success).toBe(false);
  });
});

describe('questionMoveSchema', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('takes question ids and a module name', () => {
    expect(questionMoveSchema.parse({ questionIds: [id], topic: ' Module 2 ' })).toEqual({
      questionIds: [id],
      topic: 'Module 2',
    });
  });

  it('needs at least one question and a named module', () => {
    expect(questionMoveSchema.safeParse({ questionIds: [], topic: 'Module 2' }).success).toBe(
      false,
    );
    expect(questionMoveSchema.safeParse({ questionIds: [id], topic: '' }).success).toBe(false);
    expect(questionMoveSchema.safeParse({ questionIds: ['nope'], topic: 'A' }).success).toBe(false);
  });
});

describe('question CSV without a topic column', () => {
  const header = 'difficulty,stem,option_a,option_b,option_c,option_d,correct';

  it('imports into Unsorted when the file has no topic column', () => {
    const result = parseQuestionsCsv(`${header}\neasy,What is 1 + 1?,1,2,3,4,B\n`);
    expect(result.rowErrors).toEqual([]);
    expect(result.questions[0]?.topic).toBe('Unsorted');
  });

  it('imports into Unsorted when a row leaves the topic cell empty', () => {
    const result = parseQuestionsCsv(`topic,${header}\n,easy,What is 1 + 1?,1,2,3,4,B\n`);
    expect(result.rowErrors).toEqual([]);
    expect(result.questions[0]?.topic).toBe('Unsorted');
  });

  it('still requires the other columns', () => {
    const result = parseQuestionsCsv('stem\nWhat?\n');
    expect(result.rowErrors[0]?.message).toMatch(/Missing columns: .*difficulty/);
  });
});
