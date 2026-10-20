import {
  SAMPLE_ROSTER_CSV,
  SAMPLE_ROSTER_FILENAME,
  buildTokensCsv,
  parseCsvRecords,
  parseRosterText,
  type IssuedToken,
  type RosterEmailResult,
  type RosterEntry,
  type RosterParseError,
} from '@quizup/shared';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { api, describeError } from '../lib/api';
import { saveBlob } from '../lib/download';
import { readFileText } from '../lib/readFile';
import { CopyButton } from './CopyButton';
import { EmailTokensDialog } from './EmailTokensDialog';
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
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailDialog, setEmailDialog] = useState<{
    rosterIds: string[] | undefined;
    count: number;
  } | null>(null);
  const [emailReport, setEmailReport] = useState<RosterEmailResult | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await api.getRoster(sessionId);
      setEntries(loaded.entries);
      setEmailEnabled(loaded.emailEnabled);
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

  async function handleCsvChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const lines = parseCsvRecords(await readFileText(file))
      .map(([name = '', email = '']) =>
        email.trim() ? `${name.trim()}, ${email.trim()}` : name.trim(),
      )
      .filter((line) => line !== '');
    setText(lines.join('\n'));
    setLineErrors([]);
  }

  function handleSampleDownload() {
    saveBlob(
      new Blob([SAMPLE_ROSTER_CSV], { type: 'text/csv;charset=utf-8' }),
      SAMPLE_ROSTER_FILENAME,
    );
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
  if (emailReport && emailReport.failed.length > 0) {
    problems.push(
      `Could not email: ${emailReport.failed.map((entry) => entry.displayName).join(', ')}`,
    );
  }
  const emailableCount = entries.filter((entry) => entry.emailable).length;
  const noEmailCount =
    emailReport?.skipped.filter((entry) => entry.reason === 'no_email').length ?? 0;
  const noTokenCount =
    emailReport?.skipped.filter((entry) => entry.reason === 'no_token').length ?? 0;

  return (
    <Panel
      title="Invited students"
      description={`${joinedCount} of ${entries.length} joined. Only people on this list can take the quiz, each with their own token.`}
      actions={
        <span className="flex flex-wrap gap-2">
          {emailEnabled && emailableCount > 0 && (
            <Button
              size="sm"
              onClick={() => {
                setEmailReport(null);
                setEmailDialog({ rosterIds: undefined, count: emailableCount });
              }}
            >
              Email tokens
            </Button>
          )}
          {issuedCount > 0 && (
            <Button variant="secondary" size="sm" onClick={handleDownload}>
              Download tokens (CSV)
            </Button>
          )}
        </span>
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
        {emailReport && (
          <Notice tone="info">
            Sent {emailReport.sent} {emailReport.sent === 1 ? 'email' : 'emails'}.
            {noEmailCount > 0 &&
              ` ${noEmailCount} ${noEmailCount === 1 ? 'student has' : 'students have'} no email address.`}
            {noTokenCount > 0 &&
              ` ${noTokenCount} ${noTokenCount === 1 ? 'student needs' : 'students need'} a new token first.`}
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
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy || text.trim() === ''} onClick={() => void handleAdd()}>
              Add students
            </Button>
            <Button variant="secondary" size="sm" onClick={handleSampleDownload}>
              Download a sample list
            </Button>
            <label className="cursor-pointer text-sm font-medium text-board underline underline-offset-4">
              Upload a CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => void handleCsvChosen(event)}
              />
            </label>
          </div>
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
                        <span className="flex min-w-36 flex-wrap justify-end gap-2">
                          {emailEnabled && entry.emailable && (
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`Email token to ${entry.displayName}`}
                              onClick={() => {
                                setEmailReport(null);
                                setEmailDialog({ rosterIds: [entry.id], count: 1 });
                              }}
                            >
                              Email
                            </Button>
                          )}
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
      {emailDialog && (
        <EmailTokensDialog
          sessionId={sessionId}
          rosterIds={emailDialog.rosterIds}
          recipientCount={emailDialog.count}
          onClose={() => setEmailDialog(null)}
          onSent={setEmailReport}
        />
      )}
    </Panel>
  );
}
