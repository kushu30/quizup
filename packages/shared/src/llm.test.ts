import { describe, expect, it } from 'vitest';
import {
  createGeneratedQuestionsSchema,
  generateQuestionsRequestSchema,
  generatedQuestionSchema,
} from './llm.js';

const validQuestion = {
  stem: 'What is the capital of France?',
  options: ['Paris', 'Rome', 'Madrid', 'Berlin'],
  correct_index: 0,
  difficulty: 'easy',
  topic: 'Geography',
};

describe('generatedQuestionSchema', () => {
  it('accepts a valid question', () => {
    expect(generatedQuestionSchema.safeParse(validQuestion).success).toBe(true);
  });

  it.each([3, 5])('rejects %i options', (optionCount) => {
    const options = Array.from({ length: optionCount }, (_, index) => `Option ${index}`);
    expect(generatedQuestionSchema.safeParse({ ...validQuestion, options }).success).toBe(false);
  });

  it('rejects duplicate options ignoring case', () => {
    const options = ['Paris', 'paris', 'Madrid', 'Berlin'];
    expect(generatedQuestionSchema.safeParse({ ...validQuestion, options }).success).toBe(false);
  });

  it('rejects empty and over-long options and stems', () => {
    expect(
      generatedQuestionSchema.safeParse({ ...validQuestion, options: ['A', ' ', 'C', 'D'] })
        .success,
    ).toBe(false);
    expect(
      generatedQuestionSchema.safeParse({
        ...validQuestion,
        options: ['A', 'B', 'C', 'x'.repeat(201)],
      }).success,
    ).toBe(false);
    expect(
      generatedQuestionSchema.safeParse({ ...validQuestion, stem: 'x'.repeat(501) }).success,
    ).toBe(false);
    expect(generatedQuestionSchema.safeParse({ ...validQuestion, stem: '' }).success).toBe(false);
  });

  it.each([-1, 4, 1.5, '1'])('rejects correct_index %s', (correctIndex) => {
    expect(
      generatedQuestionSchema.safeParse({ ...validQuestion, correct_index: correctIndex }).success,
    ).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(generatedQuestionSchema.safeParse({ ...validQuestion, explanation: 'x' }).success).toBe(
      false,
    );
  });

  it('rejects a bad difficulty', () => {
    expect(
      generatedQuestionSchema.safeParse({ ...validQuestion, difficulty: 'extreme' }).success,
    ).toBe(false);
  });
});

describe('createGeneratedQuestionsSchema', () => {
  it('requires exactly count items', () => {
    const schema = createGeneratedQuestionsSchema(2);
    expect(schema.safeParse([validQuestion, validQuestion]).success).toBe(true);
    expect(schema.safeParse([validQuestion]).success).toBe(false);
    expect(schema.safeParse([validQuestion, validQuestion, validQuestion]).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe('generateQuestionsRequestSchema', () => {
  const validRequest = { topic: 'Photosynthesis', count: 5, difficulty: 'medium' };

  it('accepts a valid request and treats a blank passage as absent', () => {
    expect(generateQuestionsRequestSchema.safeParse(validRequest).success).toBe(true);
    const parsed = generateQuestionsRequestSchema.parse({ ...validRequest, passage: '   ' });
    expect(parsed.passage).toBeUndefined();
  });

  it('enforces topic, passage and count limits', () => {
    expect(generateQuestionsRequestSchema.safeParse({ ...validRequest, topic: ' ' }).success).toBe(
      false,
    );
    expect(
      generateQuestionsRequestSchema.safeParse({ ...validRequest, topic: 'x'.repeat(61) }).success,
    ).toBe(false);
    expect(
      generateQuestionsRequestSchema.safeParse({ ...validRequest, passage: 'x'.repeat(8001) })
        .success,
    ).toBe(false);
    expect(
      generateQuestionsRequestSchema.safeParse({ ...validRequest, passage: 'x'.repeat(8000) })
        .success,
    ).toBe(true);
    expect(generateQuestionsRequestSchema.safeParse({ ...validRequest, count: 0 }).success).toBe(
      false,
    );
    expect(generateQuestionsRequestSchema.safeParse({ ...validRequest, count: 21 }).success).toBe(
      false,
    );
    expect(generateQuestionsRequestSchema.safeParse({ ...validRequest, count: 20 }).success).toBe(
      true,
    );
  });

  it('rejects unknown keys and bad difficulty', () => {
    expect(generateQuestionsRequestSchema.safeParse({ ...validRequest, model: 'x' }).success).toBe(
      false,
    );
    expect(
      generateQuestionsRequestSchema.safeParse({ ...validRequest, difficulty: 'insane' }).success,
    ).toBe(false);
  });
});
