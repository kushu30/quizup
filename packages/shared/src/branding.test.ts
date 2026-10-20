import { describe, expect, it } from 'vitest';
import { quizSettingsSchema } from './adaptive.js';
import { BRANDING_LIMITS, brandingSchema, hasBranding, splitStoredBranding } from './branding.js';

describe('branding', () => {
  it('accepts no branding at all', () => {
    expect(brandingSchema.parse({})).toEqual({});
    expect(hasBranding(brandingSchema.parse({}))).toBe(false);
  });

  it('treats blank fields as not set and trims text', () => {
    const parsed = brandingSchema.parse({ institutionName: '  Lincoln High  ', tagline: '   ' });
    expect(parsed).toEqual({ institutionName: 'Lincoln High' });
    expect(hasBranding(parsed)).toBe(true);
  });

  it('accepts a full brand', () => {
    const full = {
      institutionName: 'Lincoln High',
      logoUrl: 'https://abc.supabase.co/storage/v1/object/public/branding/u/q-1.png',
      tagline: 'Learning together',
      brandColor: '#1E5446',
      welcomeMessage: 'Good luck, everyone.',
      instructions: 'Keep your phone on silent.',
    };
    expect(brandingSchema.parse(full)).toEqual(full);
  });

  it('only allows https logo links', () => {
    for (const logoUrl of [
      'http://example.com/a.png',
      'javascript:alert(1)',
      'data:image/png;base64,AAA',
    ]) {
      expect(brandingSchema.safeParse({ logoUrl }).success).toBe(false);
    }
  });

  it('only allows six digit hex colours', () => {
    for (const brandColor of ['red', '#fff', '#12345g', '1E5446']) {
      expect(brandingSchema.safeParse({ brandColor }).success).toBe(false);
    }
  });

  it('enforces the length limits', () => {
    expect(
      brandingSchema.safeParse({ institutionName: 'x'.repeat(BRANDING_LIMITS.institutionName + 1) })
        .success,
    ).toBe(false);
    expect(
      brandingSchema.safeParse({ instructions: 'x'.repeat(BRANDING_LIMITS.instructions + 1) })
        .success,
    ).toBe(false);
  });

  it('is stored inside quiz settings and survives a settings round trip', () => {
    const settings = quizSettingsSchema.parse({
      adaptive: true,
      branding: { institutionName: 'Lincoln High' },
    });
    expect(settings.branding).toEqual({ institutionName: 'Lincoln High' });
    expect(quizSettingsSchema.parse({}).branding).toBeUndefined();
  });

  it('reads stored settings so that broken branding never breaks the rest', () => {
    const stored = { mode: 'exam', durationMinutes: 20, branding: { brandColor: 'nope' } };
    const { settings, branding } = splitStoredBranding(stored);
    expect(branding).toBeNull();
    expect(quizSettingsSchema.parse(settings)).toMatchObject({ mode: 'exam', durationMinutes: 20 });
    expect(splitStoredBranding({ branding: { institutionName: 'Lincoln High' } }).branding).toEqual(
      {
        institutionName: 'Lincoln High',
      },
    );
    expect(splitStoredBranding({ branding: { tagline: '  ' } }).branding).toBeNull();
    expect(splitStoredBranding(null)).toEqual({ settings: {}, branding: null });
  });
});
