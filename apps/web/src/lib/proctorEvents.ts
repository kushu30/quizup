import type { ProctorEventRecord } from '@quizup/shared';

export function mergeProctorEvents(
  loaded: readonly ProctorEventRecord[],
  live: readonly ProctorEventRecord[],
): ProctorEventRecord[] {
  const byId = new Map<string, ProctorEventRecord>();
  for (const event of [...loaded, ...live]) {
    byId.set(event.id, event);
  }
  return [...byId.values()].sort(
    (first, second) =>
      first.serverAt - second.serverAt ||
      first.clientAt - second.clientAt ||
      first.id.localeCompare(second.id),
  );
}
