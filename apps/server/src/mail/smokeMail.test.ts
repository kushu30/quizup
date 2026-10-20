import { describe, expect, it, vi } from 'vitest';
import type { Mailer } from './mailer.js';
import { sendSmokeMail } from './smokeMail.js';

function mailer(enabled = true, fail = false): Mailer & { send: ReturnType<typeof vi.fn> } {
  return {
    enabled,
    send: vi.fn(async () => {
      if (fail) {
        throw new Error('mail_send_failed');
      }
    }),
  };
}

describe('sendSmokeMail', () => {
  it('sends one clearly marked test message to the address given', async () => {
    const fake = mailer();
    const result = await sendSmokeMail(fake, 'me@example.com', 'https://quizup.example');
    expect(result).toEqual({ ok: true, to: 'me@example.com' });
    expect(fake.send).toHaveBeenCalledTimes(1);
    const sent = fake.send.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(sent.to).toBe('me@example.com');
    expect(sent.subject.startsWith('[Test] ')).toBe(true);
    expect(sent.text).toContain('https://quizup.example');
    expect(sent.html).toContain('quizup-logo-dark.png');
  });

  it('says plainly when email is not configured, and sends nothing', async () => {
    const fake = mailer(false);
    const result = await sendSmokeMail(fake, 'me@example.com', 'https://quizup.example');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toMatch(/SMTP_HOST|not configured/i);
    expect(fake.send).not.toHaveBeenCalled();
  });

  it('refuses an address that is not an email', async () => {
    const fake = mailer();
    const result = await sendSmokeMail(fake, 'not an email', 'https://quizup.example');
    expect(result.ok).toBe(false);
    expect(fake.send).not.toHaveBeenCalled();
  });

  it('reports a provider failure without any detail that could leak a secret', async () => {
    const result = await sendSmokeMail(
      mailer(true, true),
      'me@example.com',
      'https://quizup.example',
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toMatch(/provider|refused|check/i);
  });
});
