import type { RosterRecord } from './types.js';

const FAILURE_WINDOW_MS = 60_000;
const MAX_FAILURES_PER_WINDOW = 20;
const MAX_TRACKED_SOURCES = 2000;

export interface RosterItem {
  id: string;
  displayName: string;
  email: string | null;
  tokenHash: string;
  participantId: string | null;
  openedElsewhere: number;
  seating: Promise<void> | null;
}

function toItem(record: RosterRecord): RosterItem {
  return {
    id: record.id,
    displayName: record.displayName,
    email: record.email,
    tokenHash: record.tokenHash,
    participantId: record.participantId,
    openedElsewhere: 0,
    seating: null,
  };
}

export class SessionRoster {
  private readonly items = new Map<string, RosterItem>();
  private readonly idByTokenHash = new Map<string, string>();
  private readonly failuresBySource = new Map<string, number[]>();

  static from(records: RosterRecord[]): SessionRoster {
    const roster = new SessionRoster();
    for (const record of records) {
      roster.add(record);
    }
    return roster;
  }

  add(record: RosterRecord): RosterItem {
    const item = toItem(record);
    this.items.set(item.id, item);
    this.idByTokenHash.set(item.tokenHash, item.id);
    return item;
  }

  list(): RosterItem[] {
    return [...this.items.values()];
  }

  get(id: string): RosterItem | undefined {
    return this.items.get(id);
  }

  findByTokenHash(tokenHash: string): RosterItem | undefined {
    const id = this.idByTokenHash.get(tokenHash);
    return id ? this.items.get(id) : undefined;
  }

  hasName(displayName: string): boolean {
    const key = displayName.toLowerCase();
    return this.list().some((item) => item.displayName.toLowerCase() === key);
  }

  replaceTokenHash(id: string, tokenHash: string) {
    const item = this.items.get(id);
    if (!item) {
      return;
    }
    this.idByTokenHash.delete(item.tokenHash);
    item.tokenHash = tokenHash;
    this.idByTokenHash.set(tokenHash, id);
  }

  remove(id: string) {
    const item = this.items.get(id);
    if (item) {
      this.idByTokenHash.delete(item.tokenHash);
      this.items.delete(id);
    }
  }

  isThrottled(source: string, nowMs: number): boolean {
    const recent = (this.failuresBySource.get(source) ?? []).filter(
      (at) => nowMs - at < FAILURE_WINDOW_MS,
    );
    if (recent.length === 0) {
      this.failuresBySource.delete(source);
    } else {
      this.failuresBySource.set(source, recent);
    }
    return recent.length >= MAX_FAILURES_PER_WINDOW;
  }

  noteFailure(source: string, nowMs: number) {
    if (!this.failuresBySource.has(source) && this.failuresBySource.size >= MAX_TRACKED_SOURCES) {
      this.failuresBySource.clear();
    }
    this.failuresBySource.set(source, [...(this.failuresBySource.get(source) ?? []), nowMs]);
  }
}
