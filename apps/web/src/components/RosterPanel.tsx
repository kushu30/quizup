import {
  buildTokensCsv,
  groupStudentsToRosterInput,
  parseRosterText,
  type IssuedToken,
  type RosterEmailResult,
  type RosterEntry,
  type RosterParseError,
} from '@quizup/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '../lib/api';
import { saveBlob } from '../lib/download';
import { CopyButton } from './CopyButton';
import { EmailTokensDialog } from './EmailTokensDialog';
import { RosterAddStep } from './RosterAddStep';
import { SavedGroupPicker } from './SavedGroupPicker';
import { Button, Notice, Panel, TableFrame } from './ui';

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

function StepHeading({ number, title }: { number: number; title: string }) {
  return (
    <h3 className="flex items-center gap-3 text-lg font-semibold">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marker text-sm font-bold text-ink"
      >
        {number}
      </span>
      {title}
    </h3>
  );
}

export function RosterPanel({ sessionId, joinCode, refreshKey }: RosterPanelProps) {
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [tokens, setTokens] = useState<Record<string, IssuedToken>>({});
  const [text, setText] = useState('');
  const [lineErrors, setLineErrors] = useState<RosterParseError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupNote, setGroupNote] = useState<string | null>(null);
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

  async function handleAddGroup(groupId: string) {
    setMessage(null);
    setBusy(true);
    try {
      const group = await api.getGroup(groupId);
      const onList = new Set(entries.map((entry) => entry.displayName.toLowerCase()));
      const fresh = groupStudentsToRosterInput(group).filter(
        (student) => !onList.has(student.displayName.toLowerCase()),
      );
      const skipped = group.students.length - fresh.length;
      if (fresh.length === 0) {
        setMessage(
          group.students.length === 0
            ? `${group.name} has no students yet.`
            : `Everyone in ${group.name} is already on the list.`,
        );
        return;
      }
      const added = await api.addRoster(sessionId, fresh);
      setEntries(added.entries);
      rememberTokens(added.issued);
      setGroupNote(
        `Added ${fresh.length} ${fresh.length === 1 ? 'student' : 'students'} from ${group.name}.` +
          (skipped > 0 ? ` ${skipped} already on the list.` : ''),
      );
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
      description="Only people on this list can take this quiz. Each gets a personal token, so nobody can join under someone else's name."
    >
      <ol aria-label="How inviting students works" className="space-y-8">
        <li className="space-y-4">
          <StepHeading number={1} title="Add students" />
          <SavedGroupPicker busy={busy} onAddGroup={(groupId) => void handleAddGroup(groupId)} />
          {groupNote && <Notice tone="info">{groupNote}</Notice>}
          <RosterAddStep
            text={text}
            onTextChange={(next) => {
              setText(next);
              setLineErrors([]);
            }}
            onAdd={() => void handleAdd()}
            busy={busy}
          />
        </li>

        <li className="space-y-4">
          <StepHeading number={2} title="Send each student their token" />
          {entries.length === 0 ? (
            <p className="text-sm text-muted">Add students first. Their tokens appear here.</p>
          ) : (
            <div className="space-y-4">
              {issuedCount > 0 && (
                <Notice tone="warning">
                  Tokens are shown only now. Send or download them before you leave this page. If
                  one is lost, issue a new token.
                </Notice>
              )}
              <p className="text-sm text-muted">
                Every student needs their own token, or their personal link. Each row also has a
                Copy link button.
              </p>
              <div className="flex flex-wrap gap-2">
                {emailEnabled && emailableCount > 0 && (
                  <Button
                    onClick={() => {
                      setEmailReport(null);
                      setEmailDialog({ rosterIds: undefined, count: emailableCount });
                    }}
                  >
                    Email tokens
                  </Button>
                )}
                {issuedCount > 0 && (
                  <Button variant="secondary" onClick={handleDownload}>
                    Download tokens (CSV)
                  </Button>
                )}
              </div>
              {!emailEnabled && (
                <Notice tone="info">
                  Email is not set up on this server. Download the tokens CSV or copy each link and
                  send them yourself, for example in your class group.
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
            </div>
          )}
        </li>

        <li className="space-y-4">
          <StepHeading number={3} title="Watch them join" />
          <p className="text-sm text-muted">
            {joinedCount} of {entries.length} joined. Share the join code or link, then start when
            everyone you expect is in.
          </p>
          {problems.length > 0 && (
            <Notice tone="danger">
              <ul className="space-y-1">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Notice>
          )}
          {entries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-rule-strong px-5 py-6 text-center text-muted">
              Nobody is on the list yet.
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
        </li>
      </ol>
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
