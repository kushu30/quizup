export interface ClockSample {
  clientSentMs: number;
  serverNowMs: number;
  clientReceivedMs: number;
}

export function estimateClockOffsetMs(samples: ClockSample[]): number | null {
  let bestSample: ClockSample | null = null;
  let bestRoundTripMs = Infinity;

  for (const sample of samples) {
    const roundTripMs = sample.clientReceivedMs - sample.clientSentMs;
    if (roundTripMs < bestRoundTripMs) {
      bestRoundTripMs = roundTripMs;
      bestSample = sample;
    }
  }

  if (!bestSample) {
    return null;
  }
  return bestSample.serverNowMs + bestRoundTripMs / 2 - bestSample.clientReceivedMs;
}
