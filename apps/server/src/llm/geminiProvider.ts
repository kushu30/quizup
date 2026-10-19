import { LlmProviderError, type GenerateJsonInput, type LlmProvider } from './provider.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const QUESTION_ARRAY_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      stem: { type: 'STRING' },
      options: { type: 'ARRAY', items: { type: 'STRING' } },
      correct_index: { type: 'INTEGER' },
      difficulty: { type: 'STRING', enum: ['easy', 'medium', 'hard'] },
      topic: { type: 'STRING' },
    },
    required: ['stem', 'options', 'correct_index', 'difficulty', 'topic'],
    propertyOrdering: ['stem', 'options', 'correct_index', 'difficulty', 'topic'],
  },
};

interface GeminiResponseBody {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: { apiKey: string; model?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_GEMINI_MODEL;
  }

  async generateJson(input: GenerateJsonInput): Promise<string> {
    let response: Response;
    try {
      response = await fetch(
        `${GEMINI_BASE_URL}/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: 'POST',
          signal: input.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.systemText }] },
            contents: [{ role: 'user', parts: [{ text: input.userText }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: QUESTION_ARRAY_RESPONSE_SCHEMA,
              temperature: 0.7,
            },
          }),
        },
      );
    } catch {
      throw new LlmProviderError(input.signal.aborted ? 'timeout' : 'network');
    }

    if (!response.ok) {
      throw new LlmProviderError('http', response.status);
    }

    let body: GeminiResponseBody;
    try {
      body = (await response.json()) as GeminiResponseBody;
    } catch {
      throw new LlmProviderError(input.signal.aborted ? 'timeout' : 'empty');
    }

    if (body.promptFeedback?.blockReason) {
      throw new LlmProviderError('blocked');
    }
    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');
    if (text.trim() === '') {
      throw new LlmProviderError('empty');
    }
    return text;
  }
}
