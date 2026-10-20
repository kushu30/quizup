const MINUTE_MS = 60_000;
const SOON_MS = 10 * MINUTE_MS;
const FIVE_MS = 5 * MINUTE_MS;

export type ClockUrgency = 'calm' | 'soon' | 'urgent';

export function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(Math.ceil(milliseconds / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function urgencyOf(remainingMs: number): ClockUrgency {
  if (remainingMs <= MINUTE_MS) {
    return 'urgent';
  }
  return remainingMs <= SOON_MS ? 'soon' : 'calm';
}

export function clockLabelFor(remainingMs: number): string {
  if (remainingMs <= MINUTE_MS) {
    return 'Last minute';
  }
  if (remainingMs <= FIVE_MS) {
    return '5 minutes left';
  }
  return remainingMs <= SOON_MS ? '10 minutes left' : 'Time left';
}
