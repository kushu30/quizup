export const MAIL_FAILURE_REASONS = [
  'unreachable',
  'login_rejected',
  'refused',
  'rate_limited',
  'unknown',
] as const;

export type MailFailureReason = (typeof MAIL_FAILURE_REASONS)[number];

const DESCRIPTIONS: Record<MailFailureReason, string> = {
  unreachable:
    'The server could not reach the email provider. Hosting plans such as Render free block SMTP ports, so set BREVO_API_KEY to send over HTTPS instead.',
  login_rejected:
    'The email provider rejected the login. Check that the API key or SMTP key is current, and that this server is allowed to use it.',
  refused:
    'The email provider refused the message. Check that the sender address is verified and the recipient address is valid.',
  rate_limited:
    'The email provider is limiting how fast mail can be sent. Wait a minute and try again.',
  unknown: 'The email could not be sent. Check the server logs for the provider response.',
};

export function describeMailFailure(reason: MailFailureReason): string {
  return DESCRIPTIONS[reason];
}
