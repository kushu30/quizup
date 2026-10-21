export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) {
    return 'Not recorded';
  }
  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours} h ${minutes} min`;
  }
  if (minutes > 0) {
    return `${minutes} min ${seconds} s`;
  }
  return `${seconds} s`;
}

export function formatPercent(ratio: number | null): string {
  return ratio === null ? 'None' : `${Math.round(ratio * 100)}%`;
}
