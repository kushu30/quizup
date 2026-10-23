import { beforeEach, describe, expect, it } from 'vitest';
import { markPrecheckDone, readPrecheckDone, shouldShowPrecheck } from './precheckGate';

const BASE = { precheckDone: false, proctored: true, camera: true, mic: false } as const;

beforeEach(() => window.sessionStorage.clear());

describe('shouldShowPrecheck', () => {
  it('shows for a proctored session with a camera or microphone, until it is done', () => {
    expect(shouldShowPrecheck({ ...BASE, status: 'lobby' })).toBe(true);
    expect(shouldShowPrecheck({ ...BASE, camera: false, mic: true, status: 'running' })).toBe(true);
    expect(shouldShowPrecheck({ ...BASE, precheckDone: true, status: 'lobby' })).toBe(false);
  });

  it('does not show without proctoring, without a device, or once the session has ended', () => {
    expect(shouldShowPrecheck({ ...BASE, proctored: false, status: 'lobby' })).toBe(false);
    expect(shouldShowPrecheck({ ...BASE, camera: false, mic: false, status: 'lobby' })).toBe(false);
    expect(shouldShowPrecheck({ ...BASE, status: 'ended' })).toBe(false);
  });
});

describe('precheck storage', () => {
  it('remembers the check per join code for this tab', () => {
    expect(readPrecheckDone('ABC234')).toBe(false);
    markPrecheckDone('ABC234');
    expect(readPrecheckDone('ABC234')).toBe(true);
    expect(readPrecheckDone('ZZZ999')).toBe(false);
  });
});
