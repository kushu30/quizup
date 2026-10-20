export const EMAIL_PLACEHOLDERS = [
  { key: 'student_name', label: 'Student name', example: 'Asha Rao' },
  { key: 'quiz_title', label: 'Quiz title', example: 'Database systems mid-term' },
  {
    key: 'institution_name',
    label: 'Institution name',
    example: 'Dayananda Sagar College of Engineering',
  },
  { key: 'join_code', label: 'Join code', example: 'K7M2QX' },
  { key: 'token', label: 'Access token', example: 'K5B8J-AH9JV' },
  {
    key: 'join_link',
    label: 'Personal join link',
    example: 'https://quizup.example/join/K7M2QX#token=K5B8J-AH9JV',
  },
] as const;

export type EmailPlaceholderKey = (typeof EMAIL_PLACEHOLDERS)[number]['key'];
export type EmailPlaceholderValues = Record<EmailPlaceholderKey, string>;

export const TOKEN_EMAIL_SUBJECT_MAX = 150;
export const TOKEN_EMAIL_MESSAGE_MAX = 2000;

export const DEFAULT_TOKEN_EMAIL_SUBJECT = 'Your access to {{quiz_title}}';
export const DEFAULT_TOKEN_EMAIL_MESSAGE =
  'Hello {{student_name}},\n\nYou have been invited to take {{quiz_title}}. Use your personal link below to join. It works for you only.';

const KNOWN_KEYS = new Set<string>(EMAIL_PLACEHOLDERS.map((placeholder) => placeholder.key));
const PLACEHOLDER_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gi;

export function findUnknownPlaceholders(text: string): string[] {
  const unknown = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const key = (match[1] ?? '').toLowerCase();
    if (!KNOWN_KEYS.has(key)) {
      unknown.add(match[1] ?? '');
    }
  }
  return [...unknown];
}

export function fillPlaceholders(text: string, values: EmailPlaceholderValues): string {
  return text.replace(PLACEHOLDER_PATTERN, (whole, key: string) => {
    const lowered = key.toLowerCase();
    return KNOWN_KEYS.has(lowered) ? values[lowered as EmailPlaceholderKey] : whole;
  });
}
