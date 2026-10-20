import { randomUUID } from 'node:crypto';
import { REJOIN_WINDOW_MS, type IssuedToken, type RosterEntry } from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from './inMemoryRepository.js';
import { TEST_HOST, startLiveHarness } from './liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

function pool(): SeedQuestion[] {
  return Array.from({ length: 2 }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    topic: 'Fractions',
  }));
}

describe('access-token sessions and seat recovery', () => {
  const harnesses: Harness[] = [];
  let nowMs = Date.now();

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  async function setup(settings: unknown = { accessMode: 'token' }) {
    nowMs = Date.now();
    const harness = await startLiveHarness({ now: () => nowMs });
    harnesses.push(harness);
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      settings,
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    return { harness, summary };
  }

  async function addRoster(harness: Harness, sessionId: string, names: string[]) {
    const response = await harness.hostRequest(`/sessions/${sessionId}/roster`, {
      students: names.map((displayName) => ({ displayName })),
    });
    return {
      response,
      body: (await response.json()) as { issued: IssuedToken[]; entries: RosterEntry[] },
    };
  }

  async function roster(harness: Harness, sessionId: string) {
    const response = await harness.request(`/sessions/${sessionId}/roster`);
    return ((await response.json()) as { entries: RosterEntry[] }).entries;
  }

  it('lets an invited student in by token, with the name from the roster', async () => {
    const { harness, summary } = await setup();
    const { response, body } = await addRoster(harness, summary.session.id, ['Asha Rao']);
    expect(response.status).toBe(201);
    const issued = body.issued[0]!;
    expect(issued.token).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);

    const socket = await harness.connect();
    const ack = await socket.emitWithAck('room:join', {
      joinCode: summary.joinCode,
      accessToken: issued.token.toLowerCase().replace('-', ' '),
    });
    expect(ack).toMatchObject({ ok: true, role: 'student', displayName: 'Asha Rao' });
    const entries = await roster(harness, summary.session.id);
    expect(entries[0]).toMatchObject({ displayName: 'Asha Rao', connected: true });
    expect(entries[0]?.participantId).not.toBeNull();
  });

  it('refuses a name-only join, an unknown token, and a token on an open session', async () => {
    const { harness, summary } = await setup();
    await addRoster(harness, summary.session.id, ['Asha Rao']);
    const socket = await harness.connect();
    expect(
      await socket.emitWithAck('room:join', {
        joinCode: summary.joinCode,
        displayName: 'Asha Rao',
      }),
    ).toEqual({ ok: false, error: 'access_token_required' });
    expect(
      await socket.emitWithAck('room:join', {
        joinCode: summary.joinCode,
        accessToken: 'AAAAA-AAAAA',
      }),
    ).toEqual({ ok: false, error: 'invalid_access_token' });

    const open = await setup({});
    const other = await open.harness.connect();
    expect(
      await other.emitWithAck('room:join', {
        joinCode: open.summary.joinCode,
        accessToken: 'AAAAA-AAAAA',
      }),
    ).toEqual({ ok: false, error: 'invalid_access_token' });
  });

  it('throttles repeated wrong tokens from one source without blocking anyone else', async () => {
    const { harness, summary } = await setup();
    const { body } = await addRoster(harness, summary.session.id, ['Asha Rao']);
    const token = body.issued[0]!.token;
    let last: unknown;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      last = await harness.engine.joinStudent(
        { joinCode: summary.joinCode, accessToken: `WRONG-${attempt}` },
        { source: 'attacker' },
      );
    }
    expect(last).toEqual({ ok: false, error: 'rate_limited' });
    expect(
      await harness.engine.joinStudent(
        { joinCode: summary.joinCode, accessToken: token },
        { source: 'attacker' },
      ),
    ).toEqual({ ok: false, error: 'rate_limited' });

    const student = await harness.engine.joinStudent(
      { joinCode: summary.joinCode, accessToken: token },
      { source: 'classroom' },
    );
    expect(student.ok).toBe(true);

    nowMs += 61_000;
    const later = await harness.engine.joinStudent(
      { joinCode: summary.joinCode, accessToken: token },
      { source: 'attacker' },
    );
    expect(later.ok).toBe(true);
  });

  it('keeps one seat when the same token opens on a second device', async () => {
    const { harness, summary } = await setup();
    const { body } = await addRoster(harness, summary.session.id, ['Asha Rao']);
    const token = body.issued[0]!.token;
    const first = await harness.connect();
    const firstAck = await first.emitWithAck('room:join', {
      joinCode: summary.joinCode,
      accessToken: token,
    });
    const firstClosed = new Promise<string>((resolve) => first.once('disconnect', resolve));
    const second = await harness.connect();
    const secondAck = await second.emitWithAck('room:join', {
      joinCode: summary.joinCode,
      accessToken: token,
    });
    expect(firstAck.ok && secondAck.ok).toBe(true);
    if (
      firstAck.ok &&
      secondAck.ok &&
      firstAck.role === 'student' &&
      secondAck.role === 'student'
    ) {
      expect(secondAck.participantId).toBe(firstAck.participantId);
    }
    expect(await firstClosed).toBe('io server disconnect');
    const entries = await roster(harness, summary.session.id);
    expect(entries[0]?.openedElsewhere).toBe(1);
    expect(harness.repository.participants).toHaveLength(1);
  });

  it('creates one participant when the same token joins twice at once', async () => {
    const { harness, summary } = await setup();
    const { body } = await addRoster(harness, summary.session.id, ['Asha Rao']);
    const payload = { joinCode: summary.joinCode, accessToken: body.issued[0]!.token };
    const [first, second] = await Promise.all([
      harness.engine.joinStudent(payload),
      harness.engine.joinStudent(payload),
    ]);
    expect(first.ok && second.ok).toBe(true);
    expect(harness.repository.participants).toHaveLength(1);
  });

  it('admits a late invited student to an exam but not to a running live quiz', async () => {
    const exam = await setup({ accessMode: 'token', mode: 'exam', durationMinutes: 20 });
    const examRoster = await addRoster(exam.harness, exam.summary.session.id, ['Late Larry']);
    await exam.harness.engine.startSession(exam.summary.session.id, TEST_HOST.id);
    const lateExam = await exam.harness.engine.joinStudent({
      joinCode: exam.summary.joinCode,
      accessToken: examRoster.body.issued[0]!.token,
    });
    expect(lateExam.ok).toBe(true);

    const live = await setup();
    const liveRoster = await addRoster(live.harness, live.summary.session.id, ['Late Larry']);
    await live.harness.engine.startSession(live.summary.session.id, TEST_HOST.id);
    const lateLive = await live.harness.engine.joinStudent({
      joinCode: live.summary.joinCode,
      accessToken: liveRoster.body.issued[0]!.token,
    });
    expect(lateLive).toEqual({ ok: false, error: 'session_started' });
  });

  it('reissues a token: the old one stops working and the seat stays', async () => {
    const { harness, summary } = await setup();
    const { body } = await addRoster(harness, summary.session.id, ['Asha Rao']);
    const joined = await harness.engine.joinStudent({
      joinCode: summary.joinCode,
      accessToken: body.issued[0]!.token,
    });
    const response = await harness.hostRequest(
      `/sessions/${summary.session.id}/roster/${body.issued[0]!.rosterId}/reissue`,
    );
    const reissued = ((await response.json()) as { issued: IssuedToken }).issued;
    expect(reissued.token).not.toBe(body.issued[0]!.token);
    expect(
      await harness.engine.joinStudent({
        joinCode: summary.joinCode,
        accessToken: body.issued[0]!.token,
      }),
    ).toEqual({ ok: false, error: 'invalid_access_token' });
    const again = await harness.engine.joinStudent({
      joinCode: summary.joinCode,
      accessToken: reissued.token,
    });
    expect(again.ok && joined.ok && again.role === 'student' && joined.role === 'student').toBe(
      true,
    );
    if (again.ok && joined.ok && again.role === 'student' && joined.role === 'student') {
      expect(again.participantId).toBe(joined.participantId);
    }
  });

  it('removes an entry that has not joined and refuses one that has', async () => {
    const { harness, summary } = await setup();
    const { body } = await addRoster(harness, summary.session.id, ['Asha Rao', 'Ben Cole']);
    await harness.engine.joinStudent({
      joinCode: summary.joinCode,
      accessToken: body.issued[0]!.token,
    });
    const joinedDelete = await harness.request(
      `/sessions/${summary.session.id}/roster/${body.issued[0]!.rosterId}`,
      'host-token',
      'DELETE',
    );
    expect(joinedDelete.status).toBe(409);
    const freeDelete = await harness.request(
      `/sessions/${summary.session.id}/roster/${body.issued[1]!.rosterId}`,
      'host-token',
      'DELETE',
    );
    expect(freeDelete.status).toBe(204);
    expect(await roster(harness, summary.session.id)).toHaveLength(1);
  });

  it('rejects duplicate names, open sessions and other hosts', async () => {
    const { harness, summary } = await setup();
    await addRoster(harness, summary.session.id, ['Asha Rao']);
    expect((await addRoster(harness, summary.session.id, ['asha rao'])).response.status).toBe(409);
    expect((await addRoster(harness, summary.session.id, ['Ben', 'ben'])).response.status).toBe(
      409,
    );

    const open = await setup({});
    expect((await addRoster(open.harness, open.summary.session.id, ['Asha'])).response.status).toBe(
      409,
    );

    const foreign = await harness.request(
      `/sessions/${summary.session.id}/roster`,
      'other-host-token',
    );
    expect(foreign.status).toBe(404);
  });

  it('keeps issued tokens out of the roster listing', async () => {
    const { harness, summary } = await setup();
    const { body } = await addRoster(harness, summary.session.id, ['Asha Rao']);
    const listing = await (await harness.request(`/sessions/${summary.session.id}/roster`)).text();
    expect(listing).not.toContain(body.issued[0]!.token);
    expect(listing).not.toContain('token');
  });

  async function startedExamWithStudent() {
    const { harness, summary } = await setup({ mode: 'exam', durationMinutes: 20 });
    const first = await harness.joinAsStudent(summary.joinCode, 'Ada');
    await harness.engine.startSession(summary.session.id, TEST_HOST.id);
    return { harness, summary, first };
  }

  it('lets the host reopen a lost seat once, for five minutes', async () => {
    const { harness, summary, first } = await startedExamWithStudent();
    const socket = await harness.connect();
    expect(
      await socket.emitWithAck('room:join', { joinCode: summary.joinCode, displayName: 'Ada' }),
    ).toEqual({
      ok: false,
      error: 'name_taken',
    });

    const allowed = await harness.hostRequest(
      `/sessions/${summary.session.id}/participants/${first.participantId}/allow-rejoin`,
    );
    expect(allowed.status).toBe(200);
    const claim = await socket.emitWithAck('room:join', {
      joinCode: summary.joinCode,
      displayName: 'Ada',
    });
    expect(claim).toMatchObject({ ok: true, role: 'student', participantId: first.participantId });
    if (claim.ok && claim.role === 'student') {
      expect(claim.rejoinToken).not.toBe(first.rejoinToken);
    }

    const intruder = await harness.connect();
    expect(
      await intruder.emitWithAck('room:join', { joinCode: summary.joinCode, displayName: 'Ada' }),
    ).toEqual({
      ok: false,
      error: 'name_taken',
    });
    const oldCredential = await intruder.emitWithAck('room:join', {
      joinCode: summary.joinCode,
      displayName: 'Ada',
      rejoinToken: first.rejoinToken,
    });
    expect(oldCredential).toEqual({ ok: false, error: 'invalid_rejoin_token' });
  });

  it('closes the reopened window after five minutes', async () => {
    const { harness, summary, first } = await startedExamWithStudent();
    await harness.hostRequest(
      `/sessions/${summary.session.id}/participants/${first.participantId}/allow-rejoin`,
    );
    nowMs += REJOIN_WINDOW_MS + 1000;
    const socket = await harness.connect();
    expect(
      await socket.emitWithAck('room:join', { joinCode: summary.joinCode, displayName: 'Ada' }),
    ).toEqual({
      ok: false,
      error: 'name_taken',
    });
  });

  it('refuses to reopen a seat for a stranger or another host', async () => {
    const { harness, summary, first } = await startedExamWithStudent();
    const unknown = await harness.hostRequest(
      `/sessions/${summary.session.id}/participants/${randomUUID()}/allow-rejoin`,
    );
    expect(unknown.status).toBe(404);
    const foreign = await fetch(
      `${harness.baseUrl}/sessions/${summary.session.id}/participants/${first.participantId}/allow-rejoin`,
      { method: 'POST', headers: { Authorization: 'Bearer other-host-token' } },
    );
    expect(foreign.status).toBe(404);
  });

  it('reports the join page access mode', async () => {
    const { harness, summary } = await setup();
    const info = await (await fetch(`${harness.baseUrl}/join-info/${summary.joinCode}`)).json();
    expect(info).toMatchObject({ accessMode: 'token' });
  });
});
