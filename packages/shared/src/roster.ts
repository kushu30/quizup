import { z } from 'zod';
import { toCsv } from './csvExport.js';
import {
  TOKEN_EMAIL_MESSAGE_MAX,
  TOKEN_EMAIL_SUBJECT_MAX,
  findUnknownPlaceholders,
} from './emailTemplate.js';
import { DISPLAY_NAME_MAX_LENGTH } from './tables.js';

export const ACCESS_TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ACCESS_TOKEN_LENGTH = 10;
export const ROSTER_MAX_ENTRIES = 500;
export const ROSTER_EMAIL_MAX_LENGTH = 254;
export const REJOIN_WINDOW_MS = 5 * 60_000;

export function generateAccessToken(randomIndex: (exclusiveMax: number) => number): string {
  let token = '';
  for (let position = 0; position < ACCESS_TOKEN_LENGTH; position += 1) {
    token += ACCESS_TOKEN_ALPHABET.charAt(randomIndex(ACCESS_TOKEN_ALPHABET.length));
  }
  return token;
}

export function normalizeAccessToken(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatAccessToken(token: string): string {
  const half = Math.ceil(token.length / 2);
  return `${token.slice(0, half)}-${token.slice(half)}`;
}

export const rosterStudentInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH),
    email: z.string().trim().email().max(ROSTER_EMAIL_MAX_LENGTH).optional(),
  })
  .strict();
export type RosterStudentInput = z.infer<typeof rosterStudentInputSchema>;

export const rosterAddPayloadSchema = z
  .object({ students: z.array(rosterStudentInputSchema).min(1).max(ROSTER_MAX_ENTRIES) })
  .strict();
export type RosterAddPayload = z.infer<typeof rosterAddPayloadSchema>;

export const rosterEntrySchema = z.object({
  id: z.string().uuid(),
  emailable: z.boolean(),
  displayName: z.string(),
  email: z.string().nullable(),
  participantId: z.string().uuid().nullable(),
  connected: z.boolean(),
  openedElsewhere: z.number().int().nonnegative(),
});
export type RosterEntry = z.infer<typeof rosterEntrySchema>;

export const issuedTokenSchema = z.object({
  rosterId: z.string().uuid(),
  displayName: z.string(),
  email: z.string().nullable(),
  token: z.string(),
});
export type IssuedToken = z.infer<typeof issuedTokenSchema>;

export const rosterResponseSchema = z.object({
  entries: z.array(rosterEntrySchema),
  emailEnabled: z.boolean(),
});
export type RosterResponse = z.infer<typeof rosterResponseSchema>;

export const rosterAddResponseSchema = z.object({
  entries: z.array(rosterEntrySchema),
  issued: z.array(issuedTokenSchema),
});
export type RosterAddResponse = z.infer<typeof rosterAddResponseSchema>;

export const rosterReissueResponseSchema = z.object({ issued: issuedTokenSchema });
export type RosterReissueResponse = z.infer<typeof rosterReissueResponseSchema>;

function noUnknownPlaceholders(value: string, context: z.RefinementCtx) {
  const unknown = findUnknownPlaceholders(value);
  if (unknown.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unknown placeholder: ${unknown.map((key) => `{{${key}}}`).join(', ')}`,
    });
  }
}

const emailSubjectSchema = z
  .string()
  .trim()
  .min(1)
  .max(TOKEN_EMAIL_SUBJECT_MAX)
  .superRefine(noUnknownPlaceholders)
  .optional();

const emailMessageSchema = z
  .string()
  .trim()
  .min(1)
  .max(TOKEN_EMAIL_MESSAGE_MAX)
  .superRefine(noUnknownPlaceholders)
  .optional();

export const rosterEmailPayloadSchema = z
  .object({
    rosterIds: z.array(z.string().uuid()).min(1).max(ROSTER_MAX_ENTRIES).optional(),
    subject: emailSubjectSchema,
    message: emailMessageSchema,
  })
  .strict();
export type RosterEmailPayload = z.infer<typeof rosterEmailPayloadSchema>;

export const rosterEmailResultSchema = z.object({
  sent: z.number().int().nonnegative(),
  skipped: z.array(
    z.object({ rosterId: z.string().uuid(), reason: z.enum(['no_email', 'no_token']) }),
  ),
  failed: z.array(z.object({ rosterId: z.string().uuid(), displayName: z.string() })),
});
export type RosterEmailResult = z.infer<typeof rosterEmailResultSchema>;

export const allowRejoinResponseSchema = z.object({ expiresAtMs: z.number() });
export type AllowRejoinResponse = z.infer<typeof allowRejoinResponseSchema>;

export interface RosterParseError {
  line: number;
  message: string;
}

export function parseRosterText(text: string): {
  students: RosterStudentInput[];
  errors: RosterParseError[];
} {
  const students: RosterStudentInput[] = [];
  const errors: RosterParseError[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  const firstFilled = lines.findIndex((rawLine) => rawLine.trim() !== '');
  lines.forEach((rawLine, index) => {
    const line = index + 1;
    if (rawLine.trim() === '') {
      return;
    }
    if (index === firstFilled && /^\s*name\s*(?:[,\t]\s*e-?mail\s*)?$/i.test(rawLine)) {
      return;
    }
    const separator = rawLine.search(/[,\t]/);
    const namePart = separator === -1 ? rawLine : rawLine.slice(0, separator);
    const emailPart = separator === -1 ? '' : rawLine.slice(separator + 1);
    const candidate: Record<string, string> = { displayName: namePart };
    if (emailPart.trim() !== '') {
      candidate.email = emailPart;
    }
    const parsed = rosterStudentInputSchema.safeParse(candidate);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      errors.push({
        line,
        message:
          field === 'email'
            ? 'The email address is not valid'
            : `The name must be 1 to ${DISPLAY_NAME_MAX_LENGTH} characters`,
      });
      return;
    }
    const key = parsed.data.displayName.toLowerCase();
    if (seen.has(key)) {
      errors.push({ line, message: 'This name appears more than once' });
      return;
    }
    seen.add(key);
    students.push(parsed.data);
  });
  return { students, errors };
}

export const rosterEntryParamsSchema = z.object({
  sessionId: z.string().uuid(),
  rosterId: z.string().uuid(),
});

export const sessionParticipantParamsSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
});

export function buildTokensCsv(
  issued: readonly IssuedToken[],
  joinCode: string,
  origin: string,
): string {
  return toCsv([
    ['name', 'email', 'token', 'link'],
    ...issued.map((entry) => [
      entry.displayName,
      entry.email,
      entry.token,
      `${origin}/join/${joinCode}#token=${entry.token}`,
    ]),
  ]);
}

export const rosterEmailPreviewPayloadSchema = z
  .object({
    rosterId: z.string().uuid().optional(),
    subject: emailSubjectSchema,
    message: emailMessageSchema,
  })
  .strict();
export type RosterEmailPreviewPayload = z.infer<typeof rosterEmailPreviewPayloadSchema>;

export const rosterEmailPreviewSchema = z.object({
  to: z.string().nullable(),
  subject: z.string(),
  html: z.string(),
  text: z.string(),
  sample: z.boolean(),
});
export type RosterEmailPreview = z.infer<typeof rosterEmailPreviewSchema>;

export const rosterEmailTestResultSchema = z.object({ sentTo: z.string() });
export type RosterEmailTestResult = z.infer<typeof rosterEmailTestResultSchema>;

export const hostAccessNotifySchema = z
  .object({ email: z.string().trim().toLowerCase().email() })
  .strict();

export const hostAccessSentSchema = z.object({ sent: z.literal(true) });
