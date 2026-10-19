import { createGeneratedQuestionsSchema, type GeneratedQuestion } from '@quizup/shared';
import type { ZodIssue } from 'zod';

const MAX_REPORTED_PROBLEMS = 5;

export type ValidationResult =
  { ok: true; questions: GeneratedQuestion[] } | { ok: false; problems: string[] };

function describePath(path: (string | number)[]): string {
  if (path.length === 0) {
    return 'output';
  }
  const [first, ...rest] = path;
  const head = typeof first === 'number' ? `question ${first + 1}` : String(first);
  return rest.length === 0 ? head : `${head}.${rest.join('.')}`;
}

function describeIssue(issue: ZodIssue): string {
  let reason: string;
  switch (issue.code) {
    case 'invalid_type':
      reason = `expected ${issue.expected}`;
      break;
    case 'too_small':
      reason = issue.type === 'array' ? `needs at least ${issue.minimum} items` : 'too short';
      break;
    case 'too_big':
      reason = issue.type === 'array' ? `needs at most ${issue.maximum} items` : 'too long';
      break;
    case 'unrecognized_keys':
      reason = 'contains fields that are not allowed';
      break;
    case 'invalid_enum_value':
      reason = 'is not an allowed value';
      break;
    case 'custom':
      reason = issue.message;
      break;
    default:
      reason = 'is invalid';
  }
  return `${describePath(issue.path)}: ${reason}`;
}

export function validateGeneratedOutput(rawText: string, count: number): ValidationResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return { ok: false, problems: ['output was not valid JSON'] };
  }

  const result = createGeneratedQuestionsSchema(count).safeParse(parsedJson);
  if (result.success) {
    return { ok: true, questions: result.data };
  }

  const problems = result.error.issues.map(describeIssue);
  const unique = [...new Set(problems)].slice(0, MAX_REPORTED_PROBLEMS);
  if (Array.isArray(parsedJson) && parsedJson.length !== count) {
    unique.unshift(`expected exactly ${count} questions but received ${parsedJson.length}`);
  }
  return { ok: false, problems: unique.slice(0, MAX_REPORTED_PROBLEMS) };
}
