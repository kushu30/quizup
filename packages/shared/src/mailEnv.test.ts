import { describe, expect, it } from 'vitest';
import { isMailConfigured, serverEnvSchema } from './env.js';

const BASE = {
  CORS_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'key',
};

describe('mail settings in the server environment', () => {
  it('are all optional and mail is off when none are set', () => {
    const env = serverEnvSchema.parse(BASE);
    expect(isMailConfigured(env)).toBe(false);
    expect(env.SMTP_PORT).toBe(587);
  });

  it('treat empty strings from an unfilled .env as unset', () => {
    const env = serverEnvSchema.parse({
      ...BASE,
      SMTP_HOST: '',
      SMTP_PORT: '',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      MAIL_FROM: '',
      APP_URL: '',
    });
    expect(isMailConfigured(env)).toBe(false);
    expect(env.SMTP_PORT).toBe(587);
    expect(env.APP_URL).toBeUndefined();
  });

  it('turn mail on only when host, user, password and sender are all present', () => {
    const complete = {
      ...BASE,
      SMTP_HOST: 'smtp-relay.brevo.com',
      SMTP_PORT: '587',
      SMTP_USER: 'user@example.com',
      SMTP_PASSWORD: 'secret',
      MAIL_FROM: 'quizup@example.com',
    };
    expect(isMailConfigured(serverEnvSchema.parse(complete))).toBe(true);
    for (const missing of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'] as const) {
      expect(isMailConfigured(serverEnvSchema.parse({ ...complete, [missing]: '' }))).toBe(false);
    }
  });

  it('reject a bad port, a bad sender address and a bad app url', () => {
    expect(serverEnvSchema.safeParse({ ...BASE, SMTP_PORT: '99999' }).success).toBe(false);
    expect(serverEnvSchema.safeParse({ ...BASE, MAIL_FROM: 'not an email' }).success).toBe(false);
    expect(serverEnvSchema.safeParse({ ...BASE, APP_URL: 'nope' }).success).toBe(false);
  });
});
