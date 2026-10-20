import { describe, expect, it } from 'vitest';
import { describeDevice, parseUserAgent, sameDevice } from './deviceInfo.js';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const PIXEL =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const WINDOWS_EDGE = `${WINDOWS_CHROME} Edg/120.0.2210.91`;
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15';
const MAC_FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
const CHROMEOS =
  'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';

describe('parseUserAgent', () => {
  const cases: [string, string, { kind: string; os: string; browser: string }][] = [
    ['an iPhone', IPHONE, { kind: 'phone', os: 'iOS 17', browser: 'Safari 17' }],
    ['an iPad', IPAD, { kind: 'tablet', os: 'iOS 16', browser: 'Safari 16' }],
    ['an Android phone', PIXEL, { kind: 'phone', os: 'Android 14', browser: 'Chrome 120' }],
    [
      'an Android tablet',
      ANDROID_TABLET,
      { kind: 'tablet', os: 'Android 13', browser: 'Chrome 119' },
    ],
    [
      'Windows with Chrome',
      WINDOWS_CHROME,
      { kind: 'computer', os: 'Windows', browser: 'Chrome 120' },
    ],
    ['Windows with Edge', WINDOWS_EDGE, { kind: 'computer', os: 'Windows', browser: 'Edge 120' }],
    ['a Mac with Safari', MAC_SAFARI, { kind: 'computer', os: 'macOS', browser: 'Safari 17' }],
    ['a Mac with Firefox', MAC_FIREFOX, { kind: 'computer', os: 'macOS', browser: 'Firefox 121' }],
    ['a Chromebook', CHROMEOS, { kind: 'computer', os: 'ChromeOS', browser: 'Chrome 120' }],
    [
      'Linux with Firefox',
      LINUX_FIREFOX,
      { kind: 'computer', os: 'Linux', browser: 'Firefox 121' },
    ],
  ];

  for (const [name, userAgent, expected] of cases) {
    it(`recognises ${name}`, () => {
      expect(parseUserAgent(userAgent)).toMatchObject(expected);
    });
  }

  it('uses the screen and touch hints to tell an iPad that claims to be a Mac', () => {
    const device = parseUserAgent(MAC_SAFARI, {
      screenWidth: 820,
      screenHeight: 1180,
      touch: true,
    });
    expect(device).toMatchObject({
      kind: 'tablet',
      os: 'iPadOS',
      screen: { width: 820, height: 1180 },
    });
  });

  it('keeps a touch laptop a computer', () => {
    const device = parseUserAgent(WINDOWS_CHROME, {
      screenWidth: 1920,
      screenHeight: 1080,
      touch: true,
    });
    expect(device.kind).toBe('computer');
  });

  it('guesses the kind from the screen when the agent says nothing', () => {
    expect(parseUserAgent('', { screenWidth: 390, screenHeight: 844, touch: true }).kind).toBe(
      'phone',
    );
    expect(parseUserAgent(undefined).kind).toBe('unknown');
  });

  it('survives garbage and caps what it keeps', () => {
    const device = parseUserAgent(`Chrome/${'9'.repeat(5000)} (Windows NT 10.0)`);
    expect(device.browser === null || device.browser.length <= 40).toBe(true);
    expect(parseUserAgent('\u0000\u0001 not a user agent').kind).toBe('unknown');
  });

  it('refuses nonsense screen sizes', () => {
    expect(
      parseUserAgent(PIXEL, { screenWidth: 0, screenHeight: -5, touch: true }).screen,
    ).toBeNull();
  });
});

describe('describeDevice and sameDevice', () => {
  it('writes a short plain description', () => {
    expect(
      describeDevice(parseUserAgent(IPHONE, { screenWidth: 390, screenHeight: 844, touch: true })),
    ).toBe('Phone, iOS 17, Safari 17, 390 × 844');
    expect(describeDevice(parseUserAgent(undefined))).toBe('Unknown device');
  });

  it('treats the same browser on the same screen as one device', () => {
    const first = parseUserAgent(IPHONE, { screenWidth: 390, screenHeight: 844, touch: true });
    const again = parseUserAgent(IPHONE, { screenWidth: 390, screenHeight: 844, touch: true });
    const other = parseUserAgent(WINDOWS_CHROME);
    expect(sameDevice(first, again)).toBe(true);
    expect(sameDevice(first, other)).toBe(false);
  });
});
