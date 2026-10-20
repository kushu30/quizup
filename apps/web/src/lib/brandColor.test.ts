import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextOn } from './brandColor';

const WHITE = '#ffffff';
const INK = '#1c2533';

describe('brand colour text', () => {
  it('measures contrast like WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#1e5446', '#ffffff')).toBeCloseTo(8.71, 1);
  });

  it('puts white text on dark brand colours', () => {
    expect(readableTextOn('#1E5446')).toBe(WHITE);
    expect(readableTextOn('#000000')).toBe(WHITE);
    expect(readableTextOn('#7A1F2B')).toBe(WHITE);
  });

  it('puts ink text on light brand colours', () => {
    expect(readableTextOn('#FFFF00')).toBe(INK);
    expect(readableTextOn('#E9B949')).toBe(INK);
    expect(readableTextOn('#ffffff')).toBe(INK);
  });

  it('always picks the option with the higher contrast for mid tones', () => {
    for (const hex of ['#777777', '#3A8FB7', '#C2410C', '#16A34A']) {
      const chosen = readableTextOn(hex);
      const other = chosen === WHITE ? INK : WHITE;
      expect(contrastRatio(hex, chosen)).toBeGreaterThanOrEqual(contrastRatio(hex, other));
    }
  });
});
