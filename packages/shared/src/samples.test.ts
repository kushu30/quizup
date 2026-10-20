import { describe, expect, it } from 'vitest';
import { parseQuestionsCsv } from './csv.js';
import { HOST_ACCESS_CONTACT_EMAIL } from './contact.js';
import { parseRosterText } from './roster.js';
import { SAMPLE_QUESTIONS_CSV, SAMPLE_ROSTER_CSV } from './samples.js';

describe('sample files', () => {
  it('the sample questions import without a single error', () => {
    const parsed = parseQuestionsCsv(SAMPLE_QUESTIONS_CSV);
    expect(parsed.rowErrors).toEqual([]);
    expect(parsed.questions.length).toBeGreaterThanOrEqual(5);
    expect(new Set(parsed.questions.map((question) => question.difficulty))).toEqual(
      new Set(['easy', 'medium', 'hard']),
    );
  });

  it('the sample student list reads cleanly, header included, with and without emails', () => {
    const parsed = parseRosterText(SAMPLE_ROSTER_CSV);
    expect(parsed.errors).toEqual([]);
    expect(parsed.students.length).toBeGreaterThanOrEqual(3);
    expect(parsed.students.some((student) => student.email === undefined)).toBe(true);
    expect(parsed.students.some((student) => student.email !== undefined)).toBe(true);
  });
});

describe('parseRosterText header row', () => {
  it('skips a leading name,email header but not a student called Name', () => {
    expect(parseRosterText('name,email\nAsha,asha@example.com').students).toEqual([
      { displayName: 'Asha', email: 'asha@example.com' },
    ]);
    expect(parseRosterText('Name\nBen').students.map((student) => student.displayName)).toEqual([
      'Ben',
    ]);
    expect(parseRosterText('Name, ben@example.com').students).toEqual([
      { displayName: 'Name', email: 'ben@example.com' },
    ]);
  });
});

describe('contact', () => {
  it('gives one address to ask for host access', () => {
    expect(HOST_ACCESS_CONTACT_EMAIL).toBe('kushagra.shukla2005@gmail.com');
  });
});
