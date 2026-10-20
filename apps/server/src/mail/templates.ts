import {
  DEFAULT_TOKEN_EMAIL_MESSAGE,
  DEFAULT_TOKEN_EMAIL_SUBJECT,
  fillPlaceholders,
  contrastRatio,
  readableTextOn,
  type EmailPlaceholderValues,
} from '@quizup/shared';

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

export interface EmailBrand {
  institutionName?: string | undefined;
  logoUrl?: string | undefined;
  brandColor?: string | undefined;
}

const GREEN = '#1e5446';
const INK = '#1c2533';
const MUTED = '#566173';
const RULE = '#d8dde5';
const PAPER = '#f7f8fa';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const LOGO_WIDTH = 113;
const LOGO_HEIGHT = 30;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function oneLine(value: string, max = 150): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, max);
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

interface CleanBrand {
  name: string | null;
  logoUrl: string | null;
  color: string | null;
}

function cleanBrand(brand: EmailBrand | undefined): CleanBrand {
  return {
    name: brand?.institutionName ? oneLine(brand.institutionName, 80) || null : null,
    logoUrl: brand?.logoUrl && /^https:\/\//i.test(brand.logoUrl) ? brand.logoUrl : null,
    color: brand?.brandColor && HEX_COLOR.test(brand.brandColor) ? brand.brandColor : null,
  };
}

function quizUpLogo(appUrl: string, variant: 'dark' | 'light', width: number): string {
  const height = Math.round((width * LOGO_HEIGHT) / LOGO_WIDTH);
  return `<img src="${escapeHtml(trimSlash(appUrl))}/email/quizup-logo-${variant}.png" width="${width}" height="${height}" alt="QuizUp" style="display:block;border:0;outline:none;text-decoration:none">`;
}

function header(appUrl: string, brand: CleanBrand): string {
  if (!brand.name && !brand.logoUrl) {
    return `<tr><td style="background:#ffffff;border-bottom:4px solid ${GREEN};padding:22px 32px">
<a href="${escapeHtml(trimSlash(appUrl))}" style="text-decoration:none">${quizUpLogo(appUrl, 'dark', LOGO_WIDTH)}</a>
</td></tr>`;
  }
  const background = brand.color ?? GREEN;
  const foreground = readableTextOn(background);
  const logo = brand.logoUrl
    ? `<td valign="middle" style="padding-right:14px"><img src="${escapeHtml(brand.logoUrl)}" width="56" height="56" alt="${escapeHtml(brand.name ?? 'Institution logo')}" style="display:block;border:0;border-radius:8px;background:#ffffff;object-fit:contain"></td>`
    : '';
  const name = brand.name
    ? `<td valign="middle" style="font-size:20px;line-height:1.3;font-weight:700;color:${foreground}">${escapeHtml(brand.name)}</td>`
    : '';
  return `<tr><td style="background:${background};padding:24px 32px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo}${name}</tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>
<td valign="middle" style="font-size:12px;color:${foreground};padding-right:8px">Powered by</td>
<td valign="middle">${quizUpLogo(appUrl, foreground === '#ffffff' ? 'light' : 'dark', 85)}</td>
</tr></table>
</td></tr>`;
}

function frame(appUrl: string, brand: CleanBrand, inner: string, footer: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${PAPER};font-family:Arial,Helvetica,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${RULE}">
${header(appUrl, brand)}
<tr><td style="padding:32px">${inner}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid ${RULE};font-size:12px;line-height:1.5;color:${MUTED}">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function linkColor(accent: string): string {
  return contrastRatio(accent, '#ffffff') >= 4.5 ? accent : INK;
}

function button(href: string, label: string, background: string): string {
  const color = readableTextOn(background);
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${background};border-radius:6px">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font-size:16px;font-weight:700;color:${color};text-decoration:none">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function messageToHtml(text: string, link: string, accent: string): string {
  const safeLink = escapeHtml(link);
  return text
    .split(/\n{2,}/)
    .map((paragraph) => escapeHtml(paragraph.trim()))
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => {
      const linked = paragraph
        .split(safeLink)
        .join(`<a href="${safeLink}" style="color:${accent};font-weight:700">${safeLink}</a>`);
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6">${linked.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
}

export interface TokenEmailInput {
  studentName: string;
  quizTitle: string;
  joinCode: string;
  token: string;
  appUrl: string;
  brand?: EmailBrand | undefined;
  subject?: string | undefined;
  message?: string | undefined;
}

export function renderTokenEmail(input: TokenEmailInput): RenderedMail {
  const brand = cleanBrand(input.brand);
  const base = trimSlash(input.appUrl);
  const link = `${base}/join/${input.joinCode}#token=${input.token}`;
  const values: EmailPlaceholderValues = {
    student_name: oneLine(input.studentName, 60),
    quiz_title: oneLine(input.quizTitle),
    institution_name: brand.name ?? '',
    join_code: input.joinCode,
    token: input.token,
    join_link: link,
  };
  const subject = oneLine(fillPlaceholders(input.subject ?? DEFAULT_TOKEN_EMAIL_SUBJECT, values));
  const message = fillPlaceholders(input.message ?? DEFAULT_TOKEN_EMAIL_MESSAGE, values).trim();
  const accent = brand.color ?? GREEN;
  const linkTone = linkColor(accent);
  const note =
    'This link and token are personal to you. Please do not share them. Each admits one person, and your host can see if one is used on another device.';

  const text = [
    message,
    '',
    'Open your personal link:',
    link,
    '',
    `Or go to ${base}/join and enter:`,
    `Join code: ${input.joinCode}`,
    `Access token: ${input.token}`,
    '',
    note,
    '',
    brand.name ? `Sent on behalf of ${brand.name} using QuizUp.` : 'Sent by QuizUp.',
  ].join('\n');

  const html = frame(
    input.appUrl,
    brand,
    `${messageToHtml(message, link, linkTone)}
<div style="margin:24px 0">${button(link, 'Open my personal link', accent)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${RULE};background:${PAPER}">
<tr><td style="padding:14px 18px">
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px">
<tr><td style="padding:3px 20px 3px 0;color:${MUTED}">Join code</td><td style="font-weight:700;letter-spacing:2px;font-family:'Courier New',monospace">${escapeHtml(input.joinCode)}</td></tr>
<tr><td style="padding:3px 20px 3px 0;color:${MUTED}">Access token</td><td style="font-weight:700;letter-spacing:2px;font-family:'Courier New',monospace">${escapeHtml(input.token)}</td></tr>
</table>
</td></tr>
</table>
<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${MUTED}">If the button does not work, copy this link into your browser:</p>
<p style="margin:0 0 20px;font-size:13px;line-height:1.5;word-break:break-all"><a href="${escapeHtml(link)}" style="color:${linkTone}">${escapeHtml(link)}</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED}">${escapeHtml(note)}</p>`,
    brand.name
      ? `Sent on behalf of ${escapeHtml(brand.name)} using <a href="${escapeHtml(base)}" style="color:${MUTED}">QuizUp</a>.`
      : `Sent by <a href="${escapeHtml(base)}" style="color:${MUTED}">QuizUp</a>.`,
  );

  return { subject, text, html };
}

export interface HostAccessEmailInput {
  appUrl: string;
  contactEmail: string;
}

export function renderHostAccessEmail(input: HostAccessEmailInput): RenderedMail {
  const base = trimSlash(input.appUrl);
  const link = `${base}/host`;
  const abilities = [
    'Write questions, import a spreadsheet or review AI drafts',
    'Run live quizzes, adaptive quizzes and timed exams',
    'Invite students with personal access tokens and review results, feedback and exports',
  ];
  const text = [
    'Your account now has host access.',
    '',
    'As a host you can:',
    ...abilities.map((ability) => `- ${ability}`),
    '',
    'Sign in with this email address and open your dashboard:',
    link,
    '',
    'If you were not expecting this, you can ignore this email.',
    '',
    `Questions: ${input.contactEmail}`,
  ].join('\n');
  const html = frame(
    input.appUrl,
    cleanBrand(undefined),
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">Your account now has host access</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:1.6">As a host you can:</p>
<ul style="margin:0 0 24px;padding-left:20px;font-size:16px;line-height:1.7">
${abilities.map((ability) => `<li>${escapeHtml(ability)}</li>`).join('\n')}
</ul>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6">Sign in with this email address, then open your dashboard.</p>
<div style="margin:0 0 24px">${button(link, 'Open my dashboard', GREEN)}</div>
<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${MUTED}">If the button does not work, copy this link into your browser:</p>
<p style="margin:0 0 20px;font-size:13px;line-height:1.5;word-break:break-all"><a href="${escapeHtml(link)}" style="color:${GREEN}">${escapeHtml(link)}</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED}">If you were not expecting this, you can ignore this email. Questions: <a href="mailto:${escapeHtml(input.contactEmail)}" style="color:${GREEN}">${escapeHtml(input.contactEmail)}</a></p>`,
    `Sent by <a href="${escapeHtml(base)}" style="color:${MUTED}">QuizUp</a>.`,
  );
  return { subject: 'You can now host quizzes on QuizUp', text, html };
}
