import {
  DEFAULT_TOKEN_EMAIL_MESSAGE,
  DEFAULT_TOKEN_EMAIL_SUBJECT,
  EMAIL_PLACEHOLDERS,
  TOKEN_EMAIL_MESSAGE_MAX,
  TOKEN_EMAIL_SUBJECT_MAX,
  findUnknownPlaceholders,
  type RosterEmailPreview,
  type RosterEmailResult,
} from '@quizup/shared';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { api, describeError } from '../lib/api';
import { Button, Notice, TextAreaField, TextField } from './ui';

const PREVIEW_DELAY_MS = 400;

interface EmailTokensDialogProps {
  sessionId: string;
  rosterIds: string[] | undefined;
  recipientCount: number;
  onClose: () => void;
  onSent: (result: RosterEmailResult) => void;
}

function unknownMessage(text: string): string | null {
  const unknown = findUnknownPlaceholders(text);
  return unknown.length > 0
    ? `Unknown placeholder: ${unknown.map((key) => `{{${key}}}`).join(', ')}`
    : null;
}

export function EmailTokensDialog({
  sessionId,
  rosterIds,
  recipientCount,
  onClose,
  onSent,
}: EmailTokensDialogProps) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const requestCounter = useRef(0);
  const [subject, setSubject] = useState(DEFAULT_TOKEN_EMAIL_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_TOKEN_EMAIL_MESSAGE);
  const [preview, setPreview] = useState<RosterEmailPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [testNote, setTestNote] = useState<string | null>(null);

  const subjectProblem = unknownMessage(subject);
  const messageProblem = unknownMessage(message);
  const subjectEmpty = subject.trim() === '';
  const messageEmpty = message.trim() === '';
  const invalid = Boolean(subjectProblem || messageProblem || subjectEmpty || messageEmpty);
  const rosterId = rosterIds?.length === 1 ? rosterIds[0] : undefined;

  useEffect(() => {
    rootRef.current?.querySelector('input')?.focus();
  }, []);

  useEffect(() => {
    if (invalid) {
      return;
    }
    const timer = setTimeout(() => {
      requestCounter.current += 1;
      const mine = requestCounter.current;
      api
        .previewRosterEmail(sessionId, { rosterId, subject, message })
        .then((result) => {
          if (mine === requestCounter.current) {
            setPreview(result);
            setPreviewError(null);
          }
        })
        .catch((error: unknown) => {
          if (mine === requestCounter.current) {
            setPreviewError(describeError(error));
          }
        });
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [sessionId, rosterId, subject, message, invalid]);

  function insertPlaceholder(key: string) {
    const textarea = rootRef.current?.querySelector('textarea');
    const token = `{{${key}}}`;
    const start = textarea?.selectionStart ?? message.length;
    const end = textarea?.selectionEnd ?? message.length;
    setMessage(`${message.slice(0, start)}${token}${message.slice(end)}`);
    const caret = start + token.length;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(caret, caret);
    });
  }

  async function handleSend() {
    setSending(true);
    setSendError(null);
    try {
      const result = await api.emailRosterTokens(sessionId, rosterIds, { subject, message });
      onSent(result);
      onClose();
    } catch (error) {
      setSendError(describeError(error));
    } finally {
      setSending(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setSendError(null);
    setTestNote(null);
    try {
      const result = await api.testRosterEmail(sessionId, { subject, message });
      setTestNote(`Test sent to ${result.sentTo}`);
    } catch (error) {
      setSendError(describeError(error));
    } finally {
      setTesting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  const busy = sending || testing;

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 sm:items-center">
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="animate-pop w-full max-w-5xl space-y-5 rounded-xl bg-surface p-5 shadow-xl sm:p-6"
      >
        <div className="space-y-1">
          <h2 id={titleId} className="text-xl font-semibold">
            Email access tokens
          </h2>
          <p className="text-sm text-muted">
            Each student gets their own token. Edit the wording, check the preview, then send.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <TextField
              label="Subject"
              value={subject}
              maxLength={TOKEN_EMAIL_SUBJECT_MAX}
              error={subjectProblem}
              onChange={(event) => setSubject(event.target.value)}
            />
            <TextAreaField
              label="Message"
              rows={9}
              value={message}
              maxLength={TOKEN_EMAIL_MESSAGE_MAX}
              error={messageProblem}
              hint="Your logo, the button, the join code and the token are added below your message."
              onChange={(event) => setMessage(event.target.value)}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium">Placeholders</p>
              <ul className="flex flex-wrap gap-2">
                {EMAIL_PLACEHOLDERS.map((placeholder) => (
                  <li key={placeholder.key}>
                    <button
                      type="button"
                      title={`For example: ${placeholder.example}`}
                      aria-label={`Insert ${placeholder.label}`}
                      onClick={() => insertPlaceholder(placeholder.key)}
                      className="rounded-md border border-rule-strong bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:border-board hover:bg-board-soft"
                    >
                      {placeholder.label}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                Click one to insert it at the cursor. It is replaced for each student.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSubject(DEFAULT_TOKEN_EMAIL_SUBJECT);
                setMessage(DEFAULT_TOKEN_EMAIL_MESSAGE);
              }}
              className="text-sm font-medium text-board underline underline-offset-4"
            >
              Reset to default wording
            </button>
          </div>

          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium">
              {preview
                ? preview.sample
                  ? 'Sample preview, no student selected'
                  : `Preview for ${preview.to ?? 'a student'}`
                : 'Preview'}
            </p>
            {preview && (
              <p className="rounded-md bg-paper px-3 py-2 text-sm break-words">
                <span className="text-muted">Subject </span>
                <span className="font-semibold">{preview.subject}</span>
              </p>
            )}
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview?.html ?? ''}
              className="h-[28rem] w-full rounded-md border border-rule bg-paper"
            />
            {previewError && <Notice tone="danger">{previewError}</Notice>}
          </div>
        </div>

        {sendError && <Notice tone="danger">{sendError}</Notice>}
        {testNote && <Notice tone="info">{testNote}</Notice>}

        <div className="flex flex-col-reverse gap-3 border-t border-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="secondary"
              disabled={busy || invalid}
              onClick={() => void handleTest()}
            >
              Send a test to me
            </Button>
            <Button variant="brand" disabled={busy || invalid} onClick={() => void handleSend()}>
              Send to {recipientCount} {recipientCount === 1 ? 'student' : 'students'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
