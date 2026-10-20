import { isMailConfigured, type ServerEnv } from '@quizup/shared';
import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  readonly enabled: boolean;
  send: (message: MailMessage) => Promise<void>;
}

interface TransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

interface SendOptions {
  from: { name: string; address: string };
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailTransport {
  sendMail: (options: SendOptions) => Promise<unknown>;
}

export type TransportFactory = (options: TransportOptions) => MailTransport;

export const disabledMailer: Mailer = {
  enabled: false,
  send: async () => {
    throw new Error('mail_disabled');
  },
};

export function createMailer(
  env: ServerEnv,
  createTransport: TransportFactory = (options) => nodemailer.createTransport(options),
): Mailer {
  if (!isMailConfigured(env) || !env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    return disabledMailer;
  }
  const from = { name: env.MAIL_FROM_NAME ?? 'QuizUp', address: env.MAIL_FROM ?? '' };
  const transport = createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return {
    enabled: true,
    send: async (message) => {
      try {
        await transport.sendMail({
          from,
          to: message.to,
          ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code: unknown }).code)
            : 'unknown';
        console.error(`Sending mail failed (${code})`);
        throw new Error('mail_send_failed');
      }
    },
  };
}
