import {
  describeMailFailure,
  isMailConfigured,
  type MailFailureReason,
  type ServerEnv,
} from '@quizup/shared';
import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class MailSendError extends Error {
  constructor(readonly reason: MailFailureReason) {
    super('mail_send_failed');
    this.name = 'MailSendError';
  }
}

export function mailFailureText(error: unknown): string {
  return describeMailFailure(error instanceof MailSendError ? error.reason : 'unknown');
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

function describeResult(result: unknown): string {
  if (typeof result !== 'object' || result === null) {
    return 'no details';
  }
  const details = result as { messageId?: unknown; response?: unknown };
  const parts = [
    typeof details.messageId === 'string' ? `id ${details.messageId}` : null,
    typeof details.response === 'string' ? details.response.slice(0, 80) : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(', ') : 'no details';
}

export const disabledMailer: Mailer = {
  enabled: false,
  send: async () => {
    throw new Error('mail_disabled');
  },
};

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 15_000;
const ATTEMPTS = 3;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface MailerOptions {
  retryDelayMs?: number;
}

function reasonForStatus(status: number): MailFailureReason {
  if (status === 401 || status === 403) {
    return 'login_rejected';
  }
  if (status === 429) {
    return 'rate_limited';
  }
  if (status >= 500) {
    return 'unreachable';
  }
  return 'refused';
}

function reasonForSmtpCode(code: string): MailFailureReason {
  if (code === 'EAUTH') {
    return 'login_rejected';
  }
  if (code === 'EENVELOPE' || code === 'EMESSAGE') {
    return 'refused';
  }
  if (
    ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'ECONNRESET', 'EDNS'].includes(code)
  ) {
    return 'unreachable';
  }
  return 'unknown';
}

function pause(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function withRetries(attempt: () => Promise<string>, retryDelayMs: number): Promise<string> {
  let failure: MailSendError = new MailSendError('unknown');
  for (let tries = 1; tries <= ATTEMPTS; tries += 1) {
    try {
      return await attempt();
    } catch (error) {
      failure = error instanceof MailSendError ? error : new MailSendError('unknown');
      if (failure.reason !== 'unreachable' || tries === ATTEMPTS) {
        throw failure;
      }
      await pause(retryDelayMs * tries);
    }
  }
  throw failure;
}

export function createMailer(
  env: ServerEnv,
  createTransport: TransportFactory = (options) => nodemailer.createTransport(options),
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  options: MailerOptions = {},
): Mailer {
  if (!isMailConfigured(env)) {
    return disabledMailer;
  }
  const from = { name: env.MAIL_FROM_NAME ?? 'QuizUp', address: env.MAIL_FROM ?? '' };
  const retryDelayMs = options.retryDelayMs ?? 500;

  async function sendWithBrevoApi(message: MailMessage): Promise<string> {
    let response: Response;
    try {
      response = await fetchImpl(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': env.BREVO_API_KEY ?? '',
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: from.name, email: from.address },
          to: [{ email: message.to }],
          ...(env.MAIL_REPLY_TO ? { replyTo: { email: env.MAIL_REPLY_TO } } : {}),
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new MailSendError('unreachable');
    }
    if (!response.ok) {
      const providerCode = await response
        .json()
        .then((body: unknown) => {
          const code = (body as { code?: unknown } | null)?.code;
          return typeof code === 'string' ? code : 'none';
        })
        .catch(() => 'none');
      console.error(
        `Brevo API refused the message (HTTP ${response.status}, code ${providerCode})`,
      );
      throw new MailSendError(reasonForStatus(response.status));
    }
    const body = (await response.json().catch(() => ({}))) as { messageId?: unknown };
    return typeof body.messageId === 'string' ? `id ${body.messageId}` : 'no details';
  }

  const smtpTransport = env.BREVO_API_KEY
    ? null
    : createTransport({
        host: env.SMTP_HOST ?? '',
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER ?? '', pass: env.SMTP_PASSWORD ?? '' },
      });

  async function sendWithSmtp(message: MailMessage): Promise<string> {
    try {
      const result = await smtpTransport?.sendMail({
        from,
        to: message.to,
        ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return describeResult(result);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : 'unknown';
      console.error(`Sending mail through SMTP failed (${code})`);
      throw new MailSendError(reasonForSmtpCode(code));
    }
  }

  const sendOnce = env.BREVO_API_KEY ? sendWithBrevoApi : sendWithSmtp;
  return {
    enabled: true,
    send: async (message) => {
      const details = await withRetries(() => sendOnce(message), retryDelayMs);
      console.info(`Mail accepted by the provider (${details})`);
    },
  };
}
