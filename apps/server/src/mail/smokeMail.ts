import { z } from 'zod';
import type { Mailer } from './mailer.js';
import { renderTokenEmail } from './templates.js';

export type SmokeMailResult = { ok: true; to: string } | { ok: false; reason: string };

export async function sendSmokeMail(
  mailer: Mailer,
  to: string,
  appUrl: string,
): Promise<SmokeMailResult> {
  if (!mailer.enabled) {
    return {
      ok: false,
      reason:
        'Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and MAIL_FROM in the server .env.',
    };
  }
  const address = z.string().email().safeParse(to);
  if (!address.success) {
    return { ok: false, reason: 'Give an email address to send the test to.' };
  }
  const mail = renderTokenEmail({
    studentName: 'Test Student',
    quizTitle: 'QuizUp email setup',
    joinCode: 'ABC234',
    token: 'K5B8J-AH9JV',
    appUrl,
    subject: '[Test] {{quiz_title}}',
    message:
      'Hello {{student_name}},\n\nThis is a test message from your QuizUp server. If you can read it, email is set up. The join code and token below are examples and do not work.',
  });
  try {
    await mailer.send({ to: address.data, ...mail });
  } catch {
    return {
      ok: false,
      reason:
        'The mail provider refused the message. Check the SMTP login, the SMTP key and that the sender address is verified in Brevo (Transactional, Logs shows the reason).',
    };
  }
  return { ok: true, to: address.data };
}
