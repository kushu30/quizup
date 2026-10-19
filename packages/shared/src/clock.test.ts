import { describe, expect, it } from 'vitest';
import { estimateClockOffsetMs } from './clock.js';

describe('estimateClockOffsetMs', () => {
  it('returns null without samples', () => {
    expect(estimateClockOffsetMs([])).toBeNull();
  });

  it('computes serverNow + rtt/2 - clientReceived for a single sample', () => {
    const offset = estimateClockOffsetMs([
      { clientSentMs: 1000, serverNowMs: 5050, clientReceivedMs: 1100 },
    ]);
    expect(offset).toBe(4000);
  });

  it('uses the sample with the minimum round trip', () => {
    const offset = estimateClockOffsetMs([
      { clientSentMs: 2000, serverNowMs: 6500, clientReceivedMs: 2300 },
      { clientSentMs: 1000, serverNowMs: 5050, clientReceivedMs: 1100 },
      { clientSentMs: 3000, serverNowMs: 7400, clientReceivedMs: 3200 },
    ]);
    expect(offset).toBe(4000);
  });

  it('handles a client clock ahead of the server', () => {
    const offset = estimateClockOffsetMs([
      { clientSentMs: 9000, serverNowMs: 1020, clientReceivedMs: 9040 },
    ]);
    expect(offset).toBe(-8000);
  });
});
