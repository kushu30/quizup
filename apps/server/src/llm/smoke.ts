import { llmEnvSchema, parseEnvOrThrow } from '@quizup/shared';
import { createLlmProvider } from './createProvider.js';
import { generateQuestions } from './generateQuestions.js';

const llmEnv = parseEnvOrThrow(llmEnvSchema, process.env, 'LLM');
const provider = createLlmProvider(llmEnv);

if (!provider) {
  console.error('GEMINI_API_KEY is not set, nothing to test.');
  process.exit(1);
}

const startedAtMs = Date.now();
const outcome = await generateQuestions(
  { provider },
  { topic: 'Basic arithmetic', passage: undefined, count: 3, difficulty: 'easy' },
);
const elapsedMs = Date.now() - startedAtMs;

if (outcome.ok) {
  console.log(
    `provider=${provider.name} validated=true questions=${outcome.questions.length} elapsedMs=${elapsedMs}`,
  );
  process.exit(0);
}

if (outcome.reason === 'provider_unavailable') {
  console.log(
    `provider=${provider.name} validated=false reason=provider_unavailable kind=${outcome.providerErrorKind} elapsedMs=${elapsedMs}`,
  );
} else {
  console.log(
    `provider=${provider.name} validated=false reason=generation_failed problems=${outcome.summary} elapsedMs=${elapsedMs}`,
  );
}
process.exit(1);
