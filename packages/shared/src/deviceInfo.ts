import { z } from 'zod';

const MAX_USER_AGENT_LENGTH = 512;
const MAX_TEXT_LENGTH = 40;
const MAX_SCREEN_PX = 20000;
const IPAD_MAX_SCREEN_PX = 1400;

export const DEVICE_KINDS = ['phone', 'tablet', 'computer', 'unknown'] as const;
export const deviceKindSchema = z.enum(DEVICE_KINDS);
export type DeviceKind = z.infer<typeof deviceKindSchema>;

const screenPixelsSchema = z.number().int().min(1).max(MAX_SCREEN_PX);

export const deviceInfoSchema = z.object({
  kind: deviceKindSchema,
  os: z.string().max(MAX_TEXT_LENGTH).nullable(),
  browser: z.string().max(MAX_TEXT_LENGTH).nullable(),
  screen: z.object({ width: screenPixelsSchema, height: screenPixelsSchema }).nullable(),
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

export const clientHintsSchema = z
  .object({
    screenWidth: screenPixelsSchema,
    screenHeight: screenPixelsSchema,
    touch: z.boolean(),
  })
  .strict();
export type ClientHints = z.infer<typeof clientHintsSchema>;

function major(match: RegExpMatchArray | null, label: string): string | null {
  return match ? `${label} ${match[1]}` : null;
}

function detectBrowser(ua: string): string | null {
  return (
    major(ua.match(/Edg(?:e|A|iOS)?\/(\d{1,3})/), 'Edge') ??
    major(ua.match(/OPR\/(\d{1,3})/), 'Opera') ??
    major(ua.match(/SamsungBrowser\/(\d{1,3})/), 'Samsung Internet') ??
    major(ua.match(/(?:Firefox|FxiOS)\/(\d{1,3})/), 'Firefox') ??
    major(ua.match(/(?:CriOS|Chrome)\/(\d{1,3})/), 'Chrome') ??
    major(ua.match(/Version\/(\d{1,3})[^]*Safari/), 'Safari')
  );
}

function detectSystem(ua: string): { kind: DeviceKind; os: string | null } {
  const appleVersion = ua.match(/OS (\d{1,3})[_.]/)?.[1];
  if (/iPhone/.test(ua)) {
    return { kind: 'phone', os: appleVersion ? `iOS ${appleVersion}` : 'iOS' };
  }
  if (/iPad/.test(ua)) {
    return { kind: 'tablet', os: appleVersion ? `iOS ${appleVersion}` : 'iOS' };
  }
  const android = ua.match(/Android (\d{1,3})/);
  if (android || /Android/.test(ua)) {
    return {
      kind: /Mobile/.test(ua) ? 'phone' : 'tablet',
      os: android ? `Android ${android[1]}` : 'Android',
    };
  }
  if (/CrOS/.test(ua)) {
    return { kind: 'computer', os: 'ChromeOS' };
  }
  if (/Windows NT/.test(ua)) {
    return { kind: 'computer', os: 'Windows' };
  }
  if (/Macintosh|Mac OS X/.test(ua)) {
    return { kind: 'computer', os: 'macOS' };
  }
  if (/Linux|X11/.test(ua)) {
    return { kind: 'computer', os: 'Linux' };
  }
  return { kind: 'unknown', os: null };
}

export function parseUserAgent(userAgent: string | undefined, hints?: ClientHints): DeviceInfo {
  const ua = Array.from((userAgent ?? '').slice(0, MAX_USER_AGENT_LENGTH), (character) =>
    character.charCodeAt(0) < 32 ? ' ' : character,
  ).join('');
  const parsedHints = clientHintsSchema.safeParse(hints);
  const validHints = parsedHints.success ? parsedHints.data : null;
  const screen = validHints
    ? { width: validHints.screenWidth, height: validHints.screenHeight }
    : null;
  const smallestSide = screen ? Math.min(screen.width, screen.height) : null;

  let { kind, os } = detectSystem(ua);
  if (
    os === 'macOS' &&
    validHints?.touch &&
    smallestSide !== null &&
    Math.max(screen?.width ?? 0, screen?.height ?? 0) <= IPAD_MAX_SCREEN_PX
  ) {
    kind = 'tablet';
    os = 'iPadOS';
  }
  if (kind === 'unknown' && validHints?.touch && smallestSide !== null) {
    kind = smallestSide < 600 ? 'phone' : smallestSide < 1100 ? 'tablet' : 'unknown';
  }

  const browser = detectBrowser(ua);
  return {
    kind,
    os: os?.slice(0, MAX_TEXT_LENGTH) ?? null,
    browser: browser?.slice(0, MAX_TEXT_LENGTH) ?? null,
    screen,
  };
}

const KIND_LABELS: Record<DeviceKind, string | null> = {
  phone: 'Phone',
  tablet: 'Tablet',
  computer: 'Computer',
  unknown: null,
};

export function describeDevice(device: DeviceInfo): string {
  const parts = [
    KIND_LABELS[device.kind],
    device.os,
    device.browser,
    device.screen ? `${device.screen.width} × ${device.screen.height}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(', ') : 'Unknown device';
}

export function sameDevice(first: DeviceInfo, second: DeviceInfo): boolean {
  return (
    first.kind === second.kind &&
    first.os === second.os &&
    first.browser === second.browser &&
    first.screen?.width === second.screen?.width &&
    first.screen?.height === second.screen?.height
  );
}
