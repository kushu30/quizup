export interface GenerateJsonInput {
  systemText: string;
  userText: string;
  signal: AbortSignal;
}

export interface LlmProvider {
  readonly name: string;
  generateJson: (input: GenerateJsonInput) => Promise<string>;
}

export type LlmProviderErrorKind = 'timeout' | 'network' | 'http' | 'empty' | 'blocked';

export class LlmProviderError extends Error {
  readonly kind: LlmProviderErrorKind;
  readonly status: number | null;

  constructor(kind: LlmProviderErrorKind, status: number | null = null) {
    super(`LLM provider error: ${kind}`);
    this.kind = kind;
    this.status = status;
  }
}
