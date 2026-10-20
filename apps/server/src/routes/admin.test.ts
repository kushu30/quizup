import { afterEach, describe, expect, it } from 'vitest';
import { FakeMailer, startLiveHarness } from '../live/liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

describe('POST /admin/host-access/notify', () => {
  const harnesses: Harness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  async function start(
    mailer = new FakeMailer(),
    allowed: string[] = ['teacher@school.org'],
    accounts: Set<string> | 'broken' = new Set(),
  ) {
    const harness = await startLiveHarness(
      {},
      {},
      { mailer, allowlist: new Set(allowed), accounts },
    );
    harnesses.push(harness);
    return { harness, mailer };
  }

  async function notify(harness: Harness, body: unknown, token: string | null = 'admin-token') {
    const response = await fetch(`${harness.baseUrl}/admin/host-access/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it('emails a newly allowed host a welcome with a link and who to ask for help', async () => {
    const { harness, mailer } = await start();
    const result = await notify(harness, { email: 'Teacher@School.org' });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ sent: true });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe('teacher@school.org');
    expect(mailer.sent[0]?.subject).toBe('Create your QuizUp host account');
    expect(mailer.sent[0]?.text).toContain(
      'https://quizup.test/login?mode=sign-up&email=teacher%40school.org&invite=host',
    );
    expect(mailer.sent[0]?.text).toContain('kushagra.shukla2005@gmail.com');
  });

  it('only writes to an address that is really on the allowlist', async () => {
    const { harness, mailer } = await start();
    const result = await notify(harness, { email: 'stranger@example.com' });
    expect(result.status).toBe(404);
    expect(mailer.sent).toEqual([]);
  });

  it('is for admins only', async () => {
    const { harness, mailer } = await start();
    expect((await notify(harness, { email: 'teacher@school.org' }, 'host-token')).status).toBe(403);
    expect((await notify(harness, { email: 'teacher@school.org' }, 'student-token')).status).toBe(
      403,
    );
    expect((await notify(harness, { email: 'teacher@school.org' }, null)).status).toBe(401);
    expect(mailer.sent).toEqual([]);
  });

  it('says so when email is not set up, and when the provider refuses', async () => {
    const off = new FakeMailer();
    off.enabled = false;
    const quiet = await start(off);
    const notConfigured = await notify(quiet.harness, { email: 'teacher@school.org' });
    expect(notConfigured.status).toBe(409);
    expect(String(notConfigured.body.error)).toMatch(/not set up/i);

    const failing = new FakeMailer();
    failing.failFor.add('teacher@school.org');
    const broken = await start(failing);
    const refused = await notify(broken.harness, { email: 'teacher@school.org' });
    expect(refused.status).toBe(502);
    expect(String(refused.body.error)).toMatch(/could not be sent/i);
  });

  it('rejects a malformed address', async () => {
    const { harness } = await start();
    expect((await notify(harness, { email: 'nope' })).status).toBe(400);
    expect((await notify(harness, {})).status).toBe(400);
  });

  it('tells a host who already has an account to sign in, not to sign up again', async () => {
    const { harness, mailer } = await start(
      new FakeMailer(),
      ['teacher@school.org'],
      new Set(['teacher@school.org']),
    );
    expect((await notify(harness, { email: 'teacher@school.org' })).status).toBe(200);
    expect(mailer.sent[0]?.subject).toBe('You can now host quizzes on QuizUp');
    expect(mailer.sent[0]?.text).toContain(
      'https://quizup.test/login?email=teacher%40school.org&invite=host',
    );
    expect(mailer.sent[0]?.text).not.toContain('mode=sign-up');
  });

  it('still sends, with the create-account wording, when the account lookup fails', async () => {
    const { harness, mailer } = await start(new FakeMailer(), ['teacher@school.org'], 'broken');
    expect((await notify(harness, { email: 'teacher@school.org' })).status).toBe(200);
    expect(mailer.sent[0]?.subject).toBe('Create your QuizUp host account');
  });
});
