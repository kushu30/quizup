export interface StoredJoin {
  participantId: string;
  rejoinToken: string;
  displayName: string;
}

function storageKey(joinCode: string) {
  return `quizup:join:${joinCode.toUpperCase()}`;
}

export function readStoredJoin(joinCode: string): StoredJoin | null {
  try {
    const raw = window.localStorage.getItem(storageKey(joinCode));
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'participantId' in parsed &&
      'rejoinToken' in parsed &&
      'displayName' in parsed &&
      typeof parsed.participantId === 'string' &&
      typeof parsed.rejoinToken === 'string' &&
      typeof parsed.displayName === 'string'
    ) {
      return {
        participantId: parsed.participantId,
        rejoinToken: parsed.rejoinToken,
        displayName: parsed.displayName,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeStoredJoin(joinCode: string, value: StoredJoin) {
  try {
    window.localStorage.setItem(storageKey(joinCode), JSON.stringify(value));
  } catch {
    return;
  }
}

export function clearStoredJoin(joinCode: string) {
  try {
    window.localStorage.removeItem(storageKey(joinCode));
  } catch {
    return;
  }
}
