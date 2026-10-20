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
  const sendMail = vi.fn(async () => ({ messageId: 'x' }));
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
});
