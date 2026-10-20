import { describe, expect, it } from 'vitest';
import { quizSettingsSchema } from './adaptive.js';
import {
  ACCESS_TOKEN_ALPHABET,
  ACCESS_TOKEN_LENGTH,
  formatAccessToken,
  generateAccessToken,
  normalizeAccessToken,
  buildTokensCsv,
  parseRosterText,
  rosterAddPayloadSchema,
} from './roster.js';
import { studentJoinPayloadSchema } from './socket.js';

describe('access tokens', () => {
  it('generates tokens from the unambiguous alphabet', () => {
    let next = 0;
    const token = generateAccessToken((max) => next++ % max);
    expect(token).toHaveLength(ACCESS_TOKEN_LENGTH);
    expect([...token].every((char) => ACCESS_TOKEN_ALPHABET.includes(char))).toBe(true);
  });

  it('normalizes pasted tokens regardless of case, spaces and dashes', () => {
    expect(normalizeAccessToken(' abcde-23456 ')).toBe('ABCDE23456');
    expect(normalizeAccessToken('abcde 23456')).toBe('ABCDE23456');
  });

  it('formats a token in two groups for reading aloud', () => {
    expect(formatAccessToken('ABCDE23456')).toBe('ABCDE-23456');
  });
});

describe('parseRosterText', () => {
  it('reads one student per line with an optional email', () => {
    const result = parseRosterText('Asha Rao\nBen Cole, ben@example.com\n\n  Chen Wei ,  \n');
    expect(result.errors).toEqual([]);
    expect(result.students).toEqual([
      { displayName: 'Asha Rao' },
      { displayName: 'Ben Cole', email: 'ben@example.com' },
      { displayName: 'Chen Wei' },
    ]);
  });

  it('reports names that are too long, bad emails and repeats with their line numbers', () => {
    const result = parseRosterText(`${'x'.repeat(25)}\nAsha, not-an-email\nBen\nben\nCara`);
    expect(result.errors.map((error) => error.line)).toEqual([1, 2, 4]);
    expect(result.students.map((student) => student.displayName)).toEqual(['Ben', 'Cara']);
  });
});

describe('rosterAddPayloadSchema', () => {
  it('accepts 1 to 500 students and rejects unknown keys', () => {
    expect(rosterAddPayloadSchema.safeParse({ students: [{ displayName: 'Asha' }] }).success).toBe(
      true,
    );
    expect(rosterAddPayloadSchema.safeParse({ students: [] }).success).toBe(false);
    expect(
      rosterAddPayloadSchema.safeParse({
        students: Array.from({ length: 501 }, (_, i) => ({ displayName: `S${i}` })),
      }).success,
    ).toBe(false);
    expect(
      rosterAddPayloadSchema.safeParse({ students: [{ displayName: 'A', admin: true }] }).success,
    ).toBe(false);
  });
});

describe('access mode setting', () => {
  it('defaults to open and accepts token', () => {
    expect(quizSettingsSchema.parse({}).accessMode).toBe('open');
    expect(quizSettingsSchema.parse({ accessMode: 'token' }).accessMode).toBe('token');
    expect(quizSettingsSchema.safeParse({ accessMode: 'secret' }).success).toBe(false);
  });
});

describe('studentJoinPayloadSchema', () => {
  it('needs a name or an access token', () => {
    expect(studentJoinPayloadSchema.safeParse({ joinCode: 'ABC234' }).success).toBe(false);
    expect(
      studentJoinPayloadSchema.safeParse({ joinCode: 'ABC234', displayName: 'Asha' }).success,
    ).toBe(true);
    expect(
      studentJoinPayloadSchema.safeParse({ joinCode: 'abc234', accessToken: 'abcde-23456' })
        .success,
    ).toBe(true);
  });
});

describe('buildTokensCsv', () => {
  it('lists name, email, token and a personal link that keeps the token out of the path', () => {
    const csv = buildTokensCsv(
      [
        { rosterId: '1', displayName: 'Asha Rao', email: 'asha@example.com', token: 'ABCDE-23456' },
        { rosterId: '2', displayName: 'Ben, Cole', email: null, token: 'FGHJK-78923' },
      ],
      'ABC234',
      'https://quizup.example',
    );
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toBe('name,email,token,link');
    expect(lines[1]).toBe(
      'Asha Rao,asha@example.com,ABCDE-23456,https://quizup.example/join/ABC234#token=ABCDE-23456',
    );
    expect(lines[2]).toBe(
      '"Ben, Cole",,FGHJK-78923,https://quizup.example/join/ABC234#token=FGHJK-78923',
    );
  });
});
