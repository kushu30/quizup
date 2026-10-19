import type { LlmEnv } from '@quizup/shared';
import { GeminiProvider } from './geminiProvider.js';
import type { LlmProvider } from './provider.js';

export function createLlmProvider(env: LlmEnv): LlmProvider | null {
  if (env.LLM_PROVIDER === 'gemini' && env.GEMINI_API_KEY) {
    return new GeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  }
  return null;
}
