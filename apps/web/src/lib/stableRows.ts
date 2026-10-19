import { useRef } from 'react';

export function useStableRows<Row>(rows: readonly Row[], keyOf: (row: Row) => string): Row[] {
  const previous = useRef(new Map<string, { row: Row; serialized: string }>());
  const next = new Map<string, { row: Row; serialized: string }>();

  const stable = rows.map((row) => {
    const key = keyOf(row);
    const serialized = JSON.stringify(row);
    const earlier = previous.current.get(key);
    const kept = earlier && earlier.serialized === serialized ? earlier : { row, serialized };
    next.set(key, kept);
    return kept.row;
  });

  previous.current = next;
  return stable;
}
