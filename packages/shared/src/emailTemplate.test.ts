import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOKEN_EMAIL_MESSAGE,
  DEFAULT_TOKEN_EMAIL_SUBJECT,
  EMAIL_PLACEHOLDERS,
  fillPlaceholders,
  findUnknownPlaceholders,
} from './emailTemplate.js';
import { rosterEmailPayloadSchema, rosterEmailPreviewPayloadSchema } from './roster.js';

const VALUES = {
  student_name: 'Asha Rao',
  quiz_title: 'Database systems mid-term',
  institution_name: 'Dayananda Sagar College of Engineering',
  join_code: 'K7M2QX',
  token: 'K5B8J-AH9JV',
  join_link: 'https://quizup.example/join/K7M2QX#token=K5B8J-AH9JV',
};

describe('placeholders', () => {
  it('lists the six values a host can use, each with an example', () => {
    expect(EMAIL_PLACEHOLDERS.map((placeholder) => placeholder.key)).toEqual([
      'student_name',
      'quiz_title',
      'institution_name',
      'join_code',
      'token',
      'join_link',
    ]);
    for (const placeholder of EMAIL_PLACEHOLDERS) {
      expect(placeholder.example.length).toBeGreaterThan(0);
      expect(placeholder.label.length).toBeGreaterThan(0);
    }
  });

  it('fills known placeholders anywhere, with or without spaces inside the braces', () => {
    expect(fillPlaceholders('Hi {{student_name}}, code {{ join_code }}.', VALUES)).toBe(
      'Hi Asha Rao, code K7M2QX.',
    );
    expect(fillPlaceholders('{{quiz_title}} {{quiz_title}}', VALUES)).toBe(
      'Database systems mid-term Database systems mid-term',
    );
  });

  it('leaves unknown placeholders alone and does not expand values twice', () => {
    expect(
      fillPlaceholders('{{nope}} {{student_name}}', { ...VALUES, student_name: '{{token}}' }),
    ).toBe('{{nope}} {{token}}');
  });

  it('finds unknown placeholders once each', () => {
    expect(findUnknownPlaceholders('{{student_name}} {{nope}} {{ other }} {{nope}}')).toEqual([
      'nope',
      'other',
    ]);
    expect(findUnknownPlaceholders('plain text')).toEqual([]);
  });

  it('has a default subject and message that only use known placeholders', () => {
    expect(findUnknownPlaceholders(DEFAULT_TOKEN_EMAIL_SUBJECT)).toEqual([]);
    expect(findUnknownPlaceholders(DEFAULT_TOKEN_EMAIL_MESSAGE)).toEqual([]);
    expect(DEFAULT_TOKEN_EMAIL_MESSAGE).toContain('{{student_name}}');
  });
});

describe('email payloads', () => {
  it('accept a custom subject and message and reject unknown placeholders', () => {
    expect(
      rosterEmailPayloadSchema.safeParse({
        subject: 'Hello {{student_name}}',
        message: 'Join: {{join_link}}',
      }).success,
    ).toBe(true);
    const bad = rosterEmailPayloadSchema.safeParse({ message: 'Hi {{nickname}}' });
    expect(bad.success).toBe(false);
    expect(bad.success ? '' : bad.error.issues[0]?.message).toContain('{{nickname}}');
  });

  it('cap the length of the subject and the message', () => {
    expect(rosterEmailPayloadSchema.safeParse({ subject: 'x'.repeat(151) }).success).toBe(false);
    expect(rosterEmailPayloadSchema.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false);
    expect(rosterEmailPayloadSchema.safeParse({ subject: '   ' }).success).toBe(false);
  });

  it('use the same rules for the preview', () => {
    expect(
      rosterEmailPreviewPayloadSchema.safeParse({
        rosterId: '00000000-0000-4000-8000-000000000001',
        subject: 'Hi',
        message: 'Body {{token}}',
      }).success,
    ).toBe(true);
    expect(rosterEmailPreviewPayloadSchema.safeParse({ message: '{{x}}' }).success).toBe(false);
  });
});
