import { randomBytes } from 'node:crypto';
import type { RandomSource } from '@quizup/shared';

const SIX_BYTE_RANGE = 2 ** 48;

export function createCryptoRandomSource(): RandomSource {
  return {
    next: () => randomBytes(6).readUIntBE(0, 6) / SIX_BYTE_RANGE,
  };
}
