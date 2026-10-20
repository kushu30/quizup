import { z } from 'zod';

export const BRANDING_LIMITS = {
  institutionName: 80,
  logoUrl: 500,
  tagline: 120,
  welcomeMessage: 500,
  instructions: 2000,
} as const;

function optionalText(max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );
}

export const brandingSchema = z.object({
  institutionName: optionalText(BRANDING_LIMITS.institutionName),
  logoUrl: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .trim()
      .max(BRANDING_LIMITS.logoUrl)
      .url()
      .refine((value) => value.startsWith('https://'), 'The logo link must start with https://')
      .optional(),
  ),
  tagline: optionalText(BRANDING_LIMITS.tagline),
  brandColor: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1E5446')
      .optional(),
  ),
  welcomeMessage: optionalText(BRANDING_LIMITS.welcomeMessage),
  instructions: optionalText(BRANDING_LIMITS.instructions),
});
export type Branding = z.infer<typeof brandingSchema>;

export function hasBranding(branding: Branding | null | undefined): boolean {
  return Boolean(branding && Object.values(branding).some((value) => value !== undefined));
}

export function splitStoredBranding(stored: unknown): {
  settings: Record<string, unknown>;
  branding: Branding | null;
} {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return { settings: {}, branding: null };
  }
  const { branding: rawBranding, ...settings } = stored as Record<string, unknown>;
  const parsed = brandingSchema.safeParse(rawBranding ?? {});
  return { settings, branding: parsed.success && hasBranding(parsed.data) ? parsed.data : null };
}
