import type { RosterEmailResult } from '@quizup/shared';
import type { Mailer } from './mailer.js';
import {
  renderTokenEmail,
  type AccountInvite,
  type EmailBrand,
  type RenderedMail,
} from './templates.js';

const SEND_CONCURRENCY = 4;

export const SAMPLE_STUDENT = { displayName: 'Asha Rao', token: 'K5B8J-AH9JV' };
export const SAMPLE_ACCOUNT: AccountInvite = { email: 'asha.rao@example.com', hasAccount: false };

export interface PreparedTokenEmails {
  quizTitle: string;
  brand: EmailBrand;
  joinCode: string;
  items: { rosterId: string; displayName: string; email: string; token: string }[];
  skipped: RosterEmailResult['skipped'];
}

export interface CustomMailText {
  subject?: string | undefined;
  message?: string | undefined;
}

export function renderMailFor(
  prepared: PreparedTokenEmails,
  student: { displayName: string; token: string },
  appUrl: string,
  custom: CustomMailText,
  account?: AccountInvite,
): RenderedMail {
  return renderTokenEmail({
    studentName: student.displayName,
    quizTitle: prepared.quizTitle,
    joinCode: prepared.joinCode,
    token: student.token,
    appUrl,
    brand: prepared.brand,
    subject: custom.subject,
    message: custom.message,
    account,
  });
}

export async function sendTokenEmails(
  mailer: Mailer,
  appUrl: string,
  prepared: PreparedTokenEmails,
  custom: CustomMailText = {},
  accounts: Set<string> = new Set(),
): Promise<RosterEmailResult> {
  const failed: RosterEmailResult['failed'] = [];
  let sent = 0;
  let next = 0;

  async function worker() {
    while (next < prepared.items.length) {
      const item = prepared.items[next];
      next += 1;
      if (!item) {
        return;
      }
      try {
        await mailer.send({
          to: item.email,
          ...renderMailFor(prepared, item, appUrl, custom, {
            email: item.email,
            hasAccount: accounts.has(item.email.toLowerCase()),
          }),
        });
        sent += 1;
      } catch {
        failed.push({ rosterId: item.rosterId, displayName: item.displayName });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SEND_CONCURRENCY, prepared.items.length) }, () => worker()),
  );
  failed.sort((first, second) => first.displayName.localeCompare(second.displayName));
  return { sent, skipped: prepared.skipped, failed };
}
