import { describe, expect, it } from 'vitest';
import { JOIN_CODE_ALPHABET, generateJoinCode } from './joinCode.js';
import { JOIN_CODE_LENGTH } from './tables.js';

describe('join code', () => {
  it('has no ambiguous characters', () => {
    for (const forbidden of ['0', 'O', '1', 'I', 'L']) {
      expect(JOIN_CODE_ALPHABET).not.toContain(forbidden);
    }
    expect(new Set(JOIN_CODE_ALPHABET).size).toBe(JOIN_CODE_ALPHABET.length);
  });

  it('generates six characters from the alphabet', () => {
    expect(JOIN_CODE_LENGTH).toBe(6);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateJoinCode((exclusiveMax) => Math.floor(Math.random() * exclusiveMax));
      expect(code).toHaveLength(6);
      for (const character of code) {
        expect(JOIN_CODE_ALPHABET).toContain(character);
      }
    }
  });

  it('maps the random index onto the alphabet', () => {
    expect(generateJoinCode(() => 0)).toBe('AAAAAA');
    expect(generateJoinCode((exclusiveMax) => exclusiveMax - 1)).toBe('999999');
  });
});
