import { createMailer } from './mailer.js';
import { sendSmokeMail } from './smokeMail.js';
import { serverEnv } from '../env.js';

const to = process.argv[2] ?? '';
const mailer = createMailer(serverEnv);
const appUrl = serverEnv.APP_URL ?? serverEnv.CORS_ORIGINS[0] ?? '';

console.log(
  mailer.enabled
    ? serverEnv.BREVO_API_KEY
      ? `Sending from ${serverEnv.MAIL_FROM} through the Brevo HTTPS API`
      : `Sending from ${serverEnv.MAIL_FROM} through ${serverEnv.SMTP_HOST}:${serverEnv.SMTP_PORT} as ${serverEnv.SMTP_USER}`
    : 'Email is not configured.',
);

const result = await sendSmokeMail(mailer, to, appUrl);
if (result.ok) {
  console.log(
    `Sent a test to ${result.to}. In Gmail open the message, choose Show original and check SPF, DKIM and DMARC say PASS.`,
  );
} else {
  console.error(result.reason);
  process.exitCode = 1;
}
