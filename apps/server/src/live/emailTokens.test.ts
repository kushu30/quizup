import { randomUUID } from 'node:crypto';
import type {
  IssuedToken,
  RosterEmailPreview,
  RosterEmailResult,
  RosterEntry,
} from '@quizup/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedQuestion } from './inMemoryRepository.js';
import { FakeMailer, TEST_HOST, startLiveHarness } from './liveHarness.testkit.js';

type Harness = Awaited<ReturnType<typeof startLiveHarness>>;

function pool(): SeedQuestion[] {
  return Array.from({ length: 2 }, (_, index) => ({
    id: randomUUID(),
    stem: `Question ${index}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    topic: 'T',
  }));
}

describe('emailing access tokens', () => {
  const harnesses: Harness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  async function setup(
    settings: unknown = { accessMode: 'token' },
    mailer = new FakeMailer(),
    accounts: Set<string> | 'broken' = new Set(),
  ) {
    const harness = await startLiveHarness({}, {}, { mailer, accounts });
    harnesses.push(harness);
    const quizId = harness.repository.seedQuiz({
      hostId: TEST_HOST.id,
      title: 'Database systems mid-term',
      settings,
      questions: pool(),
    });
    const summary = await harness.createSession(quizId, 5000);
    return { harness, summary, mailer };
  }

  async function addRoster(
    harness: Harness,
    sessionId: string,
    students: { displayName: string; email?: string }[],
  ) {
    const response = await harness.hostRequest(`/sessions/${sessionId}/roster`, { students });
    return (await response.json()) as { issued: IssuedToken[]; entries: RosterEntry[] };
  }

  async function sendEmails(
    harness: Harness,
    sessionId: string,
    body?: unknown,
    token = 'host-token',
  ) {
    const response = await fetch(`${harness.baseUrl}/sessions/${sessionId}/roster/email`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    return { response, body: (await response.json()) as RosterEmailResult & { error?: string } };
  }

  it('tells the panel whether email is available and which students can be emailed', async () => {
    const { harness, summary } = await setup();
    await addRoster(harness, summary.session.id, [
      { displayName: 'Asha Rao', email: 'asha@example.com' },
      { displayName: 'Ben Cole' },
    ]);
    const listing = (await (
      await harness.request(`/sessions/${summary.session.id}/roster`)
    ).json()) as {
      entries: RosterEntry[];
      emailEnabled: boolean;
    };
    expect(listing.emailEnabled).toBe(true);
    expect(listing.entries.map((entry) => [entry.displayName, entry.emailable])).toEqual([
      ['Asha Rao', true],
      ['Ben Cole', false],
    ]);

    const off = new FakeMailer();
    off.enabled = false;
    const quiet = await setup({ accessMode: 'token' }, off);
    const quietListing = (await (
      await quiet.harness.request(`/sessions/${quiet.summary.session.id}/roster`)
    ).json()) as { emailEnabled: boolean };
    expect(quietListing.emailEnabled).toBe(false);
  });

  it('sends each student their own token and personal link, and nobody else', async () => {
    const { harness, summary, mailer } = await setup();
    const added = await addRoster(harness, summary.session.id, [
      { displayName: 'Asha Rao', email: 'asha@example.com' },
      { displayName: 'Ben Cole', email: 'ben@example.com' },
      { displayName: 'Chen Wei' },
    ]);
    const { response, body } = await sendEmails(harness, summary.session.id);
    expect(response.status).toBe(200);
    expect(body.sent).toBe(2);
    expect(body.skipped).toEqual([{ rosterId: added.issued[2]!.rosterId, reason: 'no_email' }]);
    expect(body.failed).toEqual([]);
    expect(mailer.sent.map((mail) => mail.to).sort()).toEqual([
      'asha@example.com',
      'ben@example.com',
    ]);
    const ashaMail = mailer.sent.find((mail) => mail.to === 'asha@example.com')!;
    expect(ashaMail.text).toContain(added.issued[0]!.token);
    expect(ashaMail.text).not.toContain(added.issued[1]!.token);
    expect(ashaMail.text).toContain(
      `https://quizup.test/join/${summary.joinCode}#token=${added.issued[0]!.token}`,
    );
    expect(ashaMail.subject).toBe('Your access to Database systems mid-term');
    expect(JSON.stringify(body)).not.toContain(added.issued[0]!.token);
  });

  it('can email only the students picked', async () => {
    const { harness, summary, mailer } = await setup();
    const added = await addRoster(harness, summary.session.id, [
      { displayName: 'Asha Rao', email: 'asha@example.com' },
      { displayName: 'Ben Cole', email: 'ben@example.com' },
    ]);
    const { body } = await sendEmails(harness, summary.session.id, {
      rosterIds: [added.issued[1]!.rosterId],
    });
    expect(body.sent).toBe(1);
    expect(mailer.sent.map((mail) => mail.to)).toEqual(['ben@example.com']);
  });

  it('mails the new token after a reissue, never the old one', async () => {
    const { harness, summary, mailer } = await setup();
    const added = await addRoster(harness, summary.session.id, [
      { displayName: 'Asha Rao', email: 'asha@example.com' },
    ]);
    const reissued = (await (
      await harness.hostRequest(
        `/sessions/${summary.session.id}/roster/${added.issued[0]!.rosterId}/reissue`,
      )
    ).json()) as { issued: IssuedToken };
    await sendEmails(harness, summary.session.id);
    expect(mailer.sent[0]?.text).toContain(reissued.issued.token);
    expect(mailer.sent[0]?.text).not.toContain(added.issued[0]!.token);
  });

  it('keeps going when one address fails and says who failed', async () => {
    const { harness, summary, mailer } = await setup();
    mailer.failFor.add('ben@example.com');
    await addRoster(harness, summary.session.id, [
      { displayName: 'Asha Rao', email: 'asha@example.com' },
      { displayName: 'Ben Cole', email: 'ben@example.com' },
      { displayName: 'Dana Okafor', email: 'dana@example.com' },
    ]);
    const { response, body } = await sendEmails(harness, summary.session.id);
    expect(response.status).toBe(200);
    expect(body.sent).toBe(2);
    expect(body.failed.map((entry) => entry.displayName)).toEqual(['Ben Cole']);
    expect(mailer.sent.map((mail) => mail.to).sort()).toEqual([
      'asha@example.com',
      'dana@example.com',
    ]);
  });

  it('puts the institution from the quiz branding in the mail', async () => {
    const { harness, summary, mailer } = await setup({
      accessMode: 'token',
      branding: { institutionName: 'Lincoln High' },
    });
    await addRoster(harness, summary.session.id, [
      { displayName: 'Asha', email: 'asha@example.com' },
    ]);
    await sendEmails(harness, summary.session.id);
    expect(mailer.sent[0]?.text).toContain('Lincoln High');
  });

  it('refuses when email is not set up, when the quiz is open to anyone, and for other people', async () => {
    const off = new FakeMailer();
    off.enabled = false;
    const quiet = await setup({ accessMode: 'token' }, off);
    await addRoster(quiet.harness, quiet.summary.session.id, [
      { displayName: 'Asha', email: 'asha@example.com' },
    ]);
    expect((await sendEmails(quiet.harness, quiet.summary.session.id)).response.status).toBe(409);
    expect(off.sent).toEqual([]);

    const open = await setup({});
    expect((await sendEmails(open.harness, open.summary.session.id)).response.status).toBe(409);

    const { harness, summary } = await setup();
    await addRoster(harness, summary.session.id, [
      { displayName: 'Asha', email: 'asha@example.com' },
    ]);
    expect(
      (await sendEmails(harness, summary.session.id, {}, 'other-host-token')).response.status,
    ).toBe(404);
    expect(
      (await sendEmails(harness, summary.session.id, {}, 'student-token')).response.status,
    ).toBe(403);
  });

  it('rejects a malformed request', async () => {
    const { harness, summary } = await setup();
    const { response } = await sendEmails(harness, summary.session.id, { rosterIds: ['nope'] });
    expect(response.status).toBe(400);
  });

  async function post(harness: Harness, path: string, body: unknown, token = 'host-token') {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { response, body: (await response.json()) as Record<string, unknown> };
  }

  describe('preview, custom text and a test to the host', () => {
    it('shows the host the exact branded mail for a real student, and sends nothing', async () => {
      const { harness, summary, mailer } = await setup({
        accessMode: 'token',
        branding: {
          institutionName: 'Lincoln High',
          logoUrl: 'https://cdn.example/lincoln.png',
          brandColor: '#7A1F2B',
        },
      });
      const added = await addRoster(harness, summary.session.id, [
        { displayName: 'Asha Rao', email: 'asha@example.com' },
        { displayName: 'Ben Cole', email: 'ben@example.com' },
      ]);
      const first = await post(harness, `/sessions/${summary.session.id}/roster/email/preview`, {});
      const preview = first.body as unknown as RosterEmailPreview;
      expect(first.response.status).toBe(200);
      expect(preview.sample).toBe(false);
      expect(preview.to).toBe('asha@example.com');
      expect(preview.subject).toBe('Your access to Database systems mid-term');
      expect(preview.html).toContain('https://cdn.example/lincoln.png');
      expect(preview.html).toContain('Powered by');
      expect(preview.html).toContain(added.issued[0]!.token);

      const second = await post(harness, `/sessions/${summary.session.id}/roster/email/preview`, {
        rosterId: added.issued[1]!.rosterId,
        message: 'Dear {{student_name}}, welcome.',
      });
      const secondPreview = second.body as unknown as RosterEmailPreview;
      expect(secondPreview.to).toBe('ben@example.com');
      expect(secondPreview.text).toContain('Dear Ben Cole, welcome.');
      expect(mailer.sent).toEqual([]);
    });

    it('falls back to an obvious sample when nobody can be emailed yet', async () => {
      const { harness, summary } = await setup();
      const result = await post(
        harness,
        `/sessions/${summary.session.id}/roster/email/preview`,
        {},
      );
      const preview = result.body as unknown as RosterEmailPreview;
      expect(preview.sample).toBe(true);
      expect(preview.to).toBeNull();
      expect(preview.text).toContain('Asha Rao');
    });

    it('sends the host-written subject and message, filled in for each student', async () => {
      const { harness, summary, mailer } = await setup();
      const added = await addRoster(harness, summary.session.id, [
        { displayName: 'Asha Rao', email: 'asha@example.com' },
        { displayName: 'Ben Cole', email: 'ben@example.com' },
      ]);
      const sent = await sendEmails(harness, summary.session.id, {
        subject: '{{student_name}}, your seat for {{quiz_title}}',
        message: 'Hi {{student_name}}. Your token is {{token}}.',
      });
      expect(sent.body.sent).toBe(2);
      const ben = mailer.sent.find((mail) => mail.to === 'ben@example.com')!;
      expect(ben.subject).toBe('Ben Cole, your seat for Database systems mid-term');
      expect(ben.text).toContain(`Hi Ben Cole. Your token is ${added.issued[1]!.token}.`);
      expect(ben.text).not.toContain(added.issued[0]!.token);
    });

    it('rejects an unknown placeholder everywhere and sends nothing', async () => {
      const { harness, summary, mailer } = await setup();
      await addRoster(harness, summary.session.id, [
        { displayName: 'Asha', email: 'asha@example.com' },
      ]);
      for (const path of ['roster/email', 'roster/email/preview', 'roster/email/test']) {
        const result = await post(harness, `/sessions/${summary.session.id}/${path}`, {
          message: 'Hello {{nickname}}',
        });
        expect(result.response.status).toBe(400);
        expect(JSON.stringify(result.body)).toContain('{{nickname}}');
      }
      expect(mailer.sent).toEqual([]);
    });

    it('sends a test only to the host, marked as a test, with an example token and no real one', async () => {
      const { harness, summary, mailer } = await setup();
      const added = await addRoster(harness, summary.session.id, [
        { displayName: 'Asha Rao', email: 'asha@example.com' },
      ]);
      const result = await post(harness, `/sessions/${summary.session.id}/roster/email/test`, {});
      expect(result.response.status).toBe(200);
      expect(result.body).toEqual({ sentTo: TEST_HOST.email });
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0]?.to).toBe(TEST_HOST.email);
      expect(mailer.sent[0]?.subject.startsWith('[Test] ')).toBe(true);
      expect(mailer.sent[0]?.text).not.toContain(added.issued[0]!.token);
      expect(mailer.sent[0]?.text).toContain('K5B8J-AH9JV');
    });

    it('refuses a test when email is off and for people who do not own the session', async () => {
      const off = new FakeMailer();
      off.enabled = false;
      const quiet = await setup({ accessMode: 'token' }, off);
      expect(
        (await post(quiet.harness, `/sessions/${quiet.summary.session.id}/roster/email/test`, {}))
          .response.status,
      ).toBe(409);
      const { harness, summary } = await setup();
      expect(
        (
          await post(
            harness,
            `/sessions/${summary.session.id}/roster/email/test`,
            {},
            'other-host-token',
          )
        ).response.status,
      ).toBe(404);
      expect(
        (
          await post(
            harness,
            `/sessions/${summary.session.id}/roster/email/preview`,
            {},
            'student-token',
          )
        ).response.status,
      ).toBe(403);
    });
  });

  describe('inviting students to make an account', () => {
    it('says it is optional to a student without an account and points an existing one to sign in', async () => {
      const { harness, summary, mailer } = await setup(
        { accessMode: 'token' },
        new FakeMailer(),
        new Set(['ben@example.com']),
      );
      await addRoster(harness, summary.session.id, [
        { displayName: 'Asha Rao', email: 'Asha@Example.com' },
        { displayName: 'Ben Cole', email: 'ben@example.com' },
      ]);
      await sendEmails(harness, summary.session.id);
      const asha = mailer.sent.find((mail) => mail.to === 'Asha@Example.com')!;
      const ben = mailer.sent.find((mail) => mail.to === 'ben@example.com')!;
      expect(asha.text).toMatch(/Optional: create a free account/);
      expect(asha.text).toContain(
        'https://quizup.test/login?mode=sign-up&email=Asha%40Example.com',
      );
      expect(ben.text).toMatch(/You already have a QuizUp account/);
      expect(ben.text).not.toContain('mode=sign-up');
    });

    it('still sends every mail when the account lookup fails', async () => {
      const { harness, summary, mailer } = await setup(
        { accessMode: 'token' },
        new FakeMailer(),
        'broken',
      );
      await addRoster(harness, summary.session.id, [
        { displayName: 'Asha', email: 'asha@example.com' },
      ]);
      const result = await sendEmails(harness, summary.session.id);
      expect(result.body.sent).toBe(1);
      expect(mailer.sent[0]?.text).toMatch(/Optional: create a free account/);
    });

    it('shows the host the same account wording in the preview, and the neutral one for the sample', async () => {
      const { harness, summary } = await setup(
        { accessMode: 'token' },
        new FakeMailer(),
        new Set(['asha@example.com']),
      );
      await addRoster(harness, summary.session.id, [
        { displayName: 'Asha', email: 'asha@example.com' },
      ]);
      const real = await post(harness, `/sessions/${summary.session.id}/roster/email/preview`, {});
      expect((real.body as unknown as RosterEmailPreview).text).toMatch(
        /You already have a QuizUp account/,
      );

      const empty = await setup();
      const sample = await post(
        empty.harness,
        `/sessions/${empty.summary.session.id}/roster/email/preview`,
        {},
      );
      expect((sample.body as unknown as RosterEmailPreview).text).toMatch(
        /Optional: create a free account/,
      );
    });
  });
});
