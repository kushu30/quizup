import {
  buildTokensCsv,
  parseRosterText,
  type IssuedToken,
  type RosterEntry,
  type RosterParseError,
} from '@quizup/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '../lib/api';
import { saveBlob } from '../lib/download';
import { CopyButton } from './CopyButton';
import { Button, Notice, Panel, TableFrame, TextAreaField } from './ui';

interface RosterPanelProps {
  sessionId: string;
  joinCode: string;
  refreshKey: number;
}

const REFRESH_EVERY_MS = 5000;

function statusOf(entry: RosterEntry): string {
  if (!entry.participantId) {
    return 'Not joined';
  }
  return entry.connected ? 'Connected' : 'Disconnected';
}

export function RosterPanel({ sessionId, joinCode, refreshKey }: RosterPanelProps) {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [tokens, setTokens] = useState<Record<string, IssuedToken>>({});
  const [text, setText] = useState('');
  const [lineErrors, setLineErrors] = useState<RosterParseError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntries((await api.getRoster(sessionId)).entries);
    } catch (error) {
      setMessage(describeError(error));
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const timer = setInterval(() => void load(), REFRESH_EVERY_MS);
    return () => clearInterval(timer);
  }, [load]);

  function rememberTokens(issued: IssuedToken[]) {
    setTokens((current) => ({
      ...current,
      ...Object.fromEntries(issued.map((entry) => [entry.rosterId, entry])),
    }));
  }

  async function handleAdd() {
    setMessage(null);
    const parsed = parseRosterText(text);
    setLineErrors(parsed.errors);
    if (parsed.errors.length > 0 || parsed.students.length === 0) {
      return;
    }
    setBusy(true);
    try {
      const added = await api.addRoster(sessionId, parsed.students);
      setEntries(added.entries);
      rememberTokens(added.issued);
      setText('');
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReissue(entry: RosterEntry) {
    setMessage(null);
    try {
      const { issued } = await api.reissueRosterToken(sessionId, entry.id);
      rememberTokens([issued]);
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function handleRemove(entry: RosterEntry) {
    setMessage(null);
    try {
      await api.removeRosterEntry(sessionId, entry.id);
      setTokens((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      await load();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  function handleDownload() {
    const csv = buildTokensCsv(Object.values(tokens), joinCode, window.location.origin);
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `quizup-tokens-${joinCode}.csv`);
  }

  const joinedCount = entries.filter((entry) => entry.participantId).length;
  const issuedCount = Object.keys(tokens).length;
  const problems = [...lineErrors.map((error) => `Line ${error.line}: ${error.message}`)];
  if (message) {
    problems.push(message);
  }

  return (
    <Panel
      title="Invited students"
      description={`${joinedCount} of ${entries.length} joined. Only people on this list can take the quiz, each with their own token.`}
      actions={
        issuedCount > 0 ? (
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            Download tokens (CSV)
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {problems.length > 0 && (
          <Notice tone="danger">
            <ul className="space-y-1">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Notice>
        )}
        {issuedCount > 0 && (
          <Notice tone="warning">
            Tokens are shown only now. Download the CSV or copy them before you leave this page. If
            one is lost, issue a new token.
          </Notice>
        )}
        <div className="space-y-3">
          <TextAreaField
            label="Add students"
            hint="One per line: a name, or a name and an email separated by a comma."
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Button disabled={busy || text.trim() === ''} onClick={() => void handleAdd()}>
            Add students
          </Button>
        </div>
        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-rule-strong px-5 py-6 text-center text-muted">
            Nobody is on the list yet. Add students above to get their tokens.
          </p>
        ) : (
          <TableFrame label="Invited students list">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-rule text-muted">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Student
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Token
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {entries.map((entry) => {
                  const issued = tokens[entry.id];
                  return (
                    <tr key={entry.id}>
                      <th scope="row" className="px-3 py-2.5 font-medium">
                        {entry.displayName}
                        {entry.email && (
                          <span className="block text-xs font-normal text-muted">
                            {entry.email}
                          </span>
                        )}
                      </th>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {statusOf(entry)}
                        {entry.openedElsewhere > 0 && (
                          <span className="block text-xs text-alert">
                            Opened on another device {entry.openedElsewhere}{' '}
                            {entry.openedElsewhere === 1 ? 'time' : 'times'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {issued ? (
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <code className="rounded bg-paper px-2 py-1 font-semibold tracking-wider select-all">
                              {issued.token}
                            </code>
                            <CopyButton
                              text={`${window.location.origin}/join/${joinCode}#token=${issued.token}`}
                              label="Copy link"
                              ariaLabel={`Copy link for ${entry.displayName}`}
                              size="sm"
                              copiedMessage="Copied"
                            />
                          </span>
                        ) : (
                          <span className="text-muted">Hidden</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex justify-end gap-2 whitespace-nowrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`New token for ${entry.displayName}`}
                            onClick={() => void handleReissue(entry)}
                          >
                            New token
                          </Button>
                          {!entry.participantId && (
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`Remove ${entry.displayName}`}
                              onClick={() => void handleRemove(entry)}
                            >
                              Remove
                            </Button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableFrame>
        )}
      </div>
    </Panel>
  );
}
