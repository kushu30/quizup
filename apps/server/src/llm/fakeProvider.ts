import { LlmProviderError, type GenerateJsonInput, type LlmProvider } from './provider.js';

export type FakeProviderStep = string | LlmProviderError | 'hang';

export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake';
  readonly userTexts: string[] = [];
  private readonly steps: FakeProviderStep[];

  constructor(steps: FakeProviderStep[]) {
    this.steps = [...steps];
  }

  get callCount() {
    return this.userTexts.length;
  }

  async generateJson(input: GenerateJsonInput): Promise<string> {
    this.userTexts.push(input.userText);
    const step = this.steps.shift();
    if (step === undefined) {
      throw new LlmProviderError('empty');
    }
    if (step === 'hang') {
      return new Promise((_resolve, reject) => {
        input.signal.addEventListener('abort', () => {
          const abortError = new Error('aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    }
    if (step instanceof LlmProviderError) {
      throw step;
    }
    return step;
  }
}
