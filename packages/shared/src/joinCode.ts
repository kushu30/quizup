import { JOIN_CODE_LENGTH } from './tables.js';

export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJoinCode(randomIndex: (exclusiveMax: number) => number): string {
  let code = '';
  for (let position = 0; position < JOIN_CODE_LENGTH; position += 1) {
    code += JOIN_CODE_ALPHABET.charAt(randomIndex(JOIN_CODE_ALPHABET.length));
  }
  return code;
}
