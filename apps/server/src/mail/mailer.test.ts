import { describe, expect, it, vi } from 'vitest';
import { serverEnvSchema } from '@quizup/shared';
import { createMailer, disabledMailer } from './mailer.js';

const BASE = {
  CORS_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'key',
};

const MAIL = {
  ...BASE,
  SMTP_HOST: 'smtp-relay.brevo.com',
  SMTP_PORT: '587',
  SMTP_USER: 'login@example.com',
  SMTP_PASSWORD: 'secret-value',
  MAIL_FROM: 'quizup@example.com',
  MAIL_FROM_NAME: 'QuizUp',
  MAIL_REPLY_TO: 'help@example.com',
};

function fakeTransport() {
  const sendMail = vi.fn(async () => ({
    messageId: '<abc123@mail.kushu30.me>',
    response: '250 2.0.0 OK queued',
  }));
  const createTransport = vi.fn(() => ({ sendMail }));
  return { sendMail, createTransport };
}

describe('createMailer', () => {
  it('is disabled when the settings are incomplete and refuses to send', async () => {
    const { createTransport } = fakeTransport();
    const mailer = createMailer(serverEnvSchema.parse(BASE), createTransport);
    expect(mailer.enabled).toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
    await expect(
      mailer.send({ to: 'a@example.com', subject: 's', text: 't', html: '<p>t</p>' }),
    ).rejects.toThrow('mail_disabled');
    expect(disabledMailer.enabled).toBe(false);
  });

  it('connects with the configured host, port and login', () => {
    const { createTransport } = fakeTransport();
    const mailer = createMailer(serverEnvSchema.parse(MAIL), createTransport);
    expect(mailer.enabled).toBe(true);
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: 'login@example.com', pass: 'secret-value' },
    });
  });

  it('uses an implicit TLS connection on port 465', () => {
    const { createTransport } = fakeTransport();
    createMailer(serverEnvSchema.parse({ ...MAIL, SMTP_PORT: '465' }), createTransport);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it('sends from the named sender with the reply address', async () => {
    const { createTransport, sendMail } = fakeTransport();
    const mailer = createMailer(serverEnvSchema.parse(MAIL), createTransport);
    await mailer.send({
      to: 'ada@example.com',
      subject: 'Hello',
      text: 'Plain',
      html: '<p>Rich</p>',
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: { name: 'QuizUp', address: 'quizup@example.com' },
      to: 'ada@example.com',
      replyTo: 'help@example.com',
      subject: 'Hello',
      text: 'Plain',
      html: '<p>Rich</p>',
    });
  });

  it('never puts the password into an error it throws', async () => {
    const sendMail = vi.fn(async () => {
      throw new Error('535 login failed for login@example.com with secret-value');
    });
    const mailer = createMailer(serverEnvSchema.parse(MAIL), () => ({ sendMail }));
    const failure = await mailer
      .send({ to: 'ada@example.com', subject: 's', text: 't', html: 'h' })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain('secret-value');
    expect((failure as Error).message).toBe('mail_send_failed');
  });

  it('logs that the provider accepted a message, with its id, but never who it was for or any secret', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { createTransport } = fakeTransport();
    const mailer = createMailer(serverEnvSchema.parse(MAIL), createTransport);
    await mailer.send({ to: 'ada@example.com', subject: 'Private subject', text: 't', html: 'h' });
    const logged = info.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain('abc123@mail.kushu30.me');
    expect(logged).toContain('250');
    for (const hidden of [
      'ada@example.com',
      'Private subject',
      'secret-value',
      'login@example.com',
    ]) {
      expect(logged).not.toContain(hidden);
    }
    info.mockRestore();
  });
});

describe('createMailer over the Brevo HTTPS API', () => {
  const API = {
    ...BASE,
    BREVO_API_KEY: 'xkeysib-secret',
    MAIL_FROM: 'quizup@example.com',
    MAIL_REPLY_TO: 'help@example.com',
  };
  const message = { to: 'a@example.com', subject: 'Hello', text: 'plain', html: '<p>plain</p>' };

  function respond(status: number, body: unknown = { messageId: '<id@brevo>' }) {
    return new Response(JSON.stringify(body), { status });
  }

  it('posts the message to Brevo on port 443 with the key in a header, never SMTP', async () => {
    const { createTransport } = fakeTransport();
    const fetchMock = vi.fn(async () => respond(201));
    const mailer = createMailer(
      serverEnvSchema.parse({ ...API, ...MAIL, BREVO_API_KEY: 'xkeysib-secret' }),
      createTransport,
      fetchMock,
    );
    expect(mailer.enabled).toBe(true);
    await mailer.send(message);
    expect(createTransport).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['api-key']).toBe('xkeysib-secret');
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'QuizUp', email: 'quizup@example.com' },
      to: [{ email: 'a@example.com' }],
      replyTo: { email: 'help@example.com' },
      subject: 'Hello',
      textContent: 'plain',
      htmlContent: '<p>plain</p>',
    });
  });

  it('is enabled with only an API key and a sender', () => {
    expect(createMailer(serverEnvSchema.parse(API), undefined, vi.fn()).enabled).toBe(true);
  });

  it.each([
    [401, 'login_rejected'],
    [403, 'login_rejected'],
    [400, 'refused'],
    [429, 'rate_limited'],
  ])('maps HTTP %i to the %s reason without retrying', async (status, reason) => {
    const fetchMock = vi.fn(async () => respond(status, { message: 'nope', code: 'x' }));
    const mailer = createMailer(serverEnvSchema.parse(API), undefined, fetchMock, {
      retryDelayMs: 0,
    });
    await expect(mailer.send(message)).rejects.toMatchObject({
      message: 'mail_send_failed',
      reason,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a network failure or a 5xx twice, then succeeds when the provider recovers', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(respond(503, {}))
      .mockResolvedValueOnce(respond(201));
    const mailer = createMailer(serverEnvSchema.parse(API), undefined, fetchMock, {
      retryDelayMs: 0,
    });
    await expect(mailer.send(message)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up as unreachable after three failed network attempts', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const mailer = createMailer(serverEnvSchema.parse(API), undefined, fetchMock, {
      retryDelayMs: 0,
    });
    await expect(mailer.send(message)).rejects.toMatchObject({ reason: 'unreachable' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never puts the key or the provider text in the thrown error or the logs', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => respond(401, { message: 'Key xkeysib-secret is invalid' }));
    const mailer = createMailer(serverEnvSchema.parse(API), undefined, fetchMock, {
      retryDelayMs: 0,
    });
    const failure = await mailer.send(message).catch((error: Error) => error);
    expect(String(failure)).not.toContain('xkeysib');
    expect(JSON.stringify(errors.mock.calls)).not.toContain('xkeysib');
    errors.mockRestore();
  });

  it('logs the accepted message id', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const mailer = createMailer(
      serverEnvSchema.parse(API),
      undefined,
      vi.fn(async () => respond(201)),
    );
    await mailer.send(message);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('<id@brevo>'));
    info.mockRestore();
  });
});
