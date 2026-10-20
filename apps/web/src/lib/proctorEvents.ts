import {
  PROCTOR_COUNTED_TYPES,
  type ProctorCountedType,
  type ProctorEventRecord,
} from '@quizup/shared';

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

export function countedProctorEvents(events: readonly ProctorEventRecord[]): number {
  return events.filter((event) => PROCTOR_COUNTED_TYPES.includes(event.type as ProctorCountedType))
    .length;
}
