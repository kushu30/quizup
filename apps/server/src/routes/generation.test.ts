import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MeResponse, Question } from '@quizup/shared';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessTokenVerifier } from '../auth.js';
import { errorHandler } from '../http.js';
import { FakeLlmProvider, type FakeProviderStep } from '../llm/fakeProvider.js';
import type { QuestionDraft } from '../llm/generateQuestions.js';
import type { GenerationRepository } from '../llm/generationRepository.js';
import { createHostGenerationLimiter } from '../llm/hostGenerationLimiter.js';
import { LlmProviderError } from '../llm/provider.js';
import { createGenerationRouter } from './generation.js';

const HOST: MeResponse = { id: randomUUID(), email: 'h@test.dev', name: 'H', role: 'host' };
const OTHER_HOST: MeResponse = { id: randomUUID(), email: 'o@test.dev', name: 'O', role: 'host' };
const STUDENT: MeResponse = { id: randomUUID(), email: 's@test.dev', name: 'S', role: 'student' };
const TOKENS: Record<string, MeResponse> = {
  'host-token': HOST,
  'other-token': OTHER_HOST,
  'student-token': STUDENT,
};
const verifier: AccessTokenVerifier = { verify: async (token) => TOKENS[token] ?? null };

const validBody = { topic: 'Geography', count: 2, difficulty: 'easy' };
const validOutput = JSON.stringify(
  [1, 2].map((index) => ({
    stem: `Question ${index}?`,
    options: [`A${index}`, `B${index}`, `C${index}`, `D${index}`],
    correct_index: 1,
    difficulty: 'easy',
    topic: 'Geography',
  })),
);

describe('POST /quizzes/:quizId/generate-questions', () => {
  const quizId = randomUUID();
  let server: Server;
  let baseUrl: string;
  let insertedBatches: QuestionDraft[][];

  const repository: GenerationRepository = {
    findOwnedQuiz: async (requestedQuizId, hostId) =>
      requestedQuizId === quizId && hostId === HOST.id ? { id: quizId } : null,
    insertGeneratedQuestions: async (ownedQuizId, drafts) => {
      insertedBatches.push(drafts);
      return drafts.map((draft): Question => ({
        id: randomUUID(),
        quiz_id: ownedQuizId,
        topic: draft.topic,
        stem: draft.stem,
        options: draft.options,
        correct_index: draft.correct_index,
        difficulty: draft.difficulty,
        elo_rating: 1000,
        source: 'llm',
        approved: false,
        position: 1,
      }));
    },
  };

  async function startServer(
    provider: FakeLlmProvider | null,
    maxPerWindow?: number,
    timeoutMs?: number,
  ) {
    const app = express();
    app.use(express.json());
    app.use(
      '/quizzes',
      createGenerationRouter({
        verifier,
        provider,
        limiter: createHostGenerationLimiter({ maxPerWindow }),
        repository,
        timeoutMs,
      }),
    );
    app.use(errorHandler);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  function generate(token: string, body: unknown = validBody, id: string = quizId) {
    return fetch(`${baseUrl}/quizzes/${id}/generate-questions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    insertedBatches = [];
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('rejects missing tokens with 401 and students with 403', async () => {
    const provider = new FakeLlmProvider([validOutput]);
    await startServer(provider);
    expect((await generate('nope')).status).toBe(401);
    expect((await generate('student-token')).status).toBe(403);
    expect(provider.callCount).toBe(0);
  });

  it('returns 404 for a quiz the host does not own', async () => {
    const provider = new FakeLlmProvider([validOutput]);
    await startServer(provider);
    expect((await generate('other-token')).status).toBe(404);
    expect((await generate('host-token', validBody, randomUUID())).status).toBe(404);
    expect(provider.callCount).toBe(0);
    expect(insertedBatches).toHaveLength(0);
  });

  it('returns 400 for a bad body', async () => {
    const provider = new FakeLlmProvider([validOutput]);
    await startServer(provider);
    expect((await generate('host-token', { ...validBody, count: 0 })).status).toBe(400);
    expect((await generate('host-token', { ...validBody, topic: '' })).status).toBe(400);
    expect((await generate('host-token', { ...validBody, extra: true })).status).toBe(400);
    expect((await generate('host-token', {}, quizId)).status).toBe(400);
    expect((await generate('host-token', validBody, 'not-a-uuid')).status).toBe(400);
    expect(provider.callCount).toBe(0);
  });

  it('returns 503 llm_not_configured when there is no provider', async () => {
    await startServer(null);
    const response = await generate('host-token');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'llm_not_configured' });
  });

  it('inserts validated questions as unapproved llm questions', async () => {
    await startServer(new FakeLlmProvider([validOutput]));
    const response = await generate('host-token');
    expect(response.status).toBe(201);
    const rows = (await response.json()) as Question[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ source: 'llm', approved: false, topic: 'Geography' });
      expect(row.options[row.correct_index]).toMatch(/^B/);
    }
    expect(insertedBatches).toHaveLength(1);
  });

  it('returns 502 and inserts nothing when output is invalid twice', async () => {
    const provider = new FakeLlmProvider(['garbage', JSON.stringify([{ stem: 'x' }])]);
    await startServer(provider);
    const response = await generate('host-token');
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string; summary: string };
    expect(body.error).toBe('generation_failed');
    expect(body.summary.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain('garbage');
    expect(insertedBatches).toHaveLength(0);
    expect(provider.callCount).toBe(2);
  });

  it('returns 503 provider_unavailable without retrying', async () => {
    const steps: FakeProviderStep[] = [new LlmProviderError('http', 500)];
    const provider = new FakeLlmProvider(steps);
    await startServer(provider);
    const response = await generate('host-token');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'provider_unavailable' });
    expect(provider.callCount).toBe(1);
    expect(insertedBatches).toHaveLength(0);
  });

  it('returns 429 with Retry-After when the host is over the limit', async () => {
    await startServer(new FakeLlmProvider([validOutput, validOutput]), 1);
    expect((await generate('host-token')).status).toBe(201);
    const limited = await generate('host-token');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('allows only one generation in flight per host', async () => {
    const provider = new FakeLlmProvider(['hang']);
    await startServer(provider, undefined, 400);
    const first = generate('host-token');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await generate('host-token');
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBe('10');
    const firstResponse = await first;
    expect(firstResponse.status).toBe(503);
    expect((await generate('host-token')).status).toBe(503);
  });
});
