import type { Difficulty, GenerateQuestionsRequest } from '@quizup/shared';
import type { LlmProvider } from './provider.js';
import { SYSTEM_PROMPT, buildRepairUserPrompt, buildUserPrompt } from './prompt.js';
import { shuffleOptions } from './shuffle.js';
import { validateGeneratedOutput } from './validate.js';

export const GENERATION_TIMEOUT_MS = 30_000;

export interface QuestionDraft {
  topic: string;
  stem: string;
  options: string[];
  correct_index: number;
  difficulty: Difficulty;
}

export type GenerationOutcome =
  | { ok: true; questions: QuestionDraft[] }
  | { ok: false; reason: 'generation_failed'; summary: string }
  | { ok: false; reason: 'provider_unavailable'; providerErrorKind: string };

export interface GenerateQuestionsDependencies {
  provider: LlmProvider;
  timeoutMs?: number;
  randomIndex?: (exclusiveMax: number) => number;
}

async function callProvider(
  provider: LlmProvider,
  userText: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await provider.generateJson({
      systemText: SYSTEM_PROMPT,
      userText,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function describeProviderFailure(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'kind' in error) {
    return String(error.kind);
  }
  return error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unknown';
}

export async function generateQuestions(
  dependencies: GenerateQuestionsDependencies,
  request: GenerateQuestionsRequest,
): Promise<GenerationOutcome> {
  const timeoutMs = dependencies.timeoutMs ?? GENERATION_TIMEOUT_MS;
  const originalUserPrompt = buildUserPrompt(request);

  let firstText: string;
  try {
    firstText = await callProvider(dependencies.provider, originalUserPrompt, timeoutMs);
  } catch (error) {
    return {
      ok: false,
      reason: 'provider_unavailable',
      providerErrorKind: describeProviderFailure(error),
    };
  }

  let validation = validateGeneratedOutput(firstText, request.count);

  if (!validation.ok) {
    let secondText: string;
    try {
      secondText = await callProvider(
        dependencies.provider,
        buildRepairUserPrompt(originalUserPrompt, validation.problems),
        timeoutMs,
      );
    } catch (error) {
      return {
        ok: false,
        reason: 'provider_unavailable',
        providerErrorKind: describeProviderFailure(error),
      };
    }
    validation = validateGeneratedOutput(secondText, request.count);
  }

  if (!validation.ok) {
    return { ok: false, reason: 'generation_failed', summary: validation.problems.join('; ') };
  }

  return {
    ok: true,
    questions: validation.questions.map((question) => {
      const shuffled = shuffleOptions(
        question.options,
        question.correct_index,
        dependencies.randomIndex,
      );
      return {
        topic: request.topic,
        stem: question.stem,
        options: shuffled.options,
        correct_index: shuffled.correctIndex,
        difficulty: request.difficulty,
      };
    }),
  };
}
