import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../http.js';
import { createInMemoryGroupRepository } from './groupRepository.js';
import { createGroupsRouter } from './groupsRouter.js';

const HOST = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'h@t.dev',
  name: 'H',
  role: 'host',
};
const OTHER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'o@t.dev',
  name: 'O',
  role: 'host',
};
const STUDENT = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 's@t.dev',
  name: 'S',
  role: 'student',
};
const USERS: Record<string, typeof HOST> = {
  host: HOST,
  other: OTHER,
  student: STUDENT,
};

let server: Server | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

async function start() {
  const app = express();
  app.use(express.json());
  app.use(
    '/groups',
    createGroupsRouter({
      verifier: { verify: async (token: string) => USERS[token] ?? null } as never,
      repository: createInMemoryGroupRepository(),
    }),
  );
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  return async (path: string, token: string | null, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}/groups${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
}

const YEAR9 = {
  name: 'Year 9A',
  students: [{ displayName: 'Asha Rao', email: 'asha@example.com' }, { displayName: 'Ben Cole' }],
};

describe('groups API', () => {
  it('creates a group, lists it with its size and returns its members in order', async () => {
    const call = await start();
    const created = await call('', 'host', 'POST', YEAR9);
    expect(created.status).toBe(201);
    expect(created.body.students).toEqual([
      { displayName: 'Asha Rao', email: 'asha@example.com' },
      { displayName: 'Ben Cole', email: null },
    ]);
    const list = await call('', 'host');
    expect(list.body).toEqual([{ id: created.body.id, name: 'Year 9A', memberCount: 2 }]);
    expect((await call(`/${created.body.id}`, 'host')).body.name).toBe('Year 9A');
  });

  it('replaces the name and members on update', async () => {
    const call = await start();
    const { body } = await call('', 'host', 'POST', YEAR9);
    const updated = await call(`/${body.id}`, 'host', 'PUT', {
      name: 'Year 9B',
      students: [{ displayName: 'Chen' }],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Year 9B');
    expect(updated.body.students).toEqual([{ displayName: 'Chen', email: null }]);
  });

  it('refuses a second group with the same name, ignoring case', async () => {
    const call = await start();
    await call('', 'host', 'POST', YEAR9);
    const again = await call('', 'host', 'POST', { ...YEAR9, name: 'year 9a' });
    expect(again.status).toBe(409);
  });

  it('keeps groups private to their host', async () => {
    const call = await start();
    const { body } = await call('', 'host', 'POST', YEAR9);
    expect((await call('', 'other')).body).toEqual([]);
    expect((await call(`/${body.id}`, 'other')).status).toBe(404);
    expect((await call(`/${body.id}`, 'other', 'PUT', YEAR9)).status).toBe(404);
    expect((await call(`/${body.id}`, 'other', 'DELETE')).status).toBe(404);
    expect((await call(`/${body.id}`, 'host')).status).toBe(200);
  });

  it('allows the same group name for different hosts', async () => {
    const call = await start();
    await call('', 'host', 'POST', YEAR9);
    expect((await call('', 'other', 'POST', YEAR9)).status).toBe(201);
  });

  it('deletes a group', async () => {
    const call = await start();
    const { body } = await call('', 'host', 'POST', YEAR9);
    expect((await call(`/${body.id}`, 'host', 'DELETE')).status).toBe(204);
    expect((await call(`/${body.id}`, 'host')).status).toBe(404);
  });

  it('rejects invalid input and non-hosts', async () => {
    const call = await start();
    expect((await call('', 'host', 'POST', { name: '', students: [] })).status).toBe(400);
    expect((await call('/not-a-uuid', 'host')).status).toBe(400);
    expect((await call('', 'student')).status).toBe(403);
    expect((await call('', null)).status).toBe(401);
  });
});
