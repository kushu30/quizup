import {
  SAMPLE_ROSTER_CSV,
  SAMPLE_ROSTER_FILENAME,
  parseCsvRecords,
  parseRosterText,
} from '@quizup/shared';
import { useEffect, useState, type ChangeEvent } from 'react';
import { saveBlob } from '../lib/download';
import { readFileText } from '../lib/readFile';
import { Button, Notice, TextAreaField } from './ui';

type Tab = 'paste' | 'upload';

interface RosterAddStepProps {
  text: string;
  onTextChange: (text: string) => void;
  onAdd: () => void;
  busy: boolean;
}

export function RosterAddStep({ text, onTextChange, onAdd, busy }: RosterAddStepProps) {
  const [tab, setTab] = useState<Tab>('paste');
  const [loadedNote, setLoadedNote] = useState<string | null>(null);

  useEffect(() => {
    if (text.trim() === '') {
      setLoadedNote(null);
    }
  }, [text]);

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
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
    const joined = lines.join('\n');
    const count = parseRosterText(joined).students.length;
    onTextChange(joined);
    setLoadedNote(
      count === 0
        ? `No students found in ${file.name}. Check that the first column holds the names.`
        : `Loaded ${count} ${count === 1 ? 'student' : 'students'} from ${file.name}. Check the list below, then press Add students.`,
    );
    setTab('paste');
  }

  function handleSampleDownload() {
    saveBlob(
      new Blob([SAMPLE_ROSTER_CSV], { type: 'text/csv;charset=utf-8' }),
      SAMPLE_ROSTER_FILENAME,
    );
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="How to add students"
        className="inline-flex rounded-lg bg-paper p-1"
      >
        {(
          [
            ['paste', 'Paste a list'],
            ['upload', 'Upload a CSV'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              tab === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'paste' ? (
        <div className="space-y-3">
          {loadedNote && <Notice tone="info">{loadedNote}</Notice>}
          <p className="text-sm text-muted">
            One student per line. Write a name, or a name and an email separated by a comma. The
            email is optional and only used if you choose to email tokens.
          </p>
          <ul className="space-y-1 rounded-md bg-paper px-3 py-2 text-sm">
            <li>
              <code>Asha Rao, asha@example.com</code>
            </li>
            <li>
              <code>Ben Cole</code>
            </li>
          </ul>
          <TextAreaField
            label="Student list"
            rows={5}
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Upload a .csv file, for example from Excel or Google Sheets (File, Download, CSV). Put a
            header in the first row, then one student per row.
          </p>
          <div className="overflow-x-auto rounded-md border border-rule">
            <table aria-label="CSV columns" className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-rule bg-paper text-muted">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Column
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    What to put
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Required
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-rule">
                  <td className="px-3 py-2">
                    <code>name</code>
                  </td>
                  <td className="px-3 py-2">The student&apos;s name, up to 24 characters</td>
                  <td className="px-3 py-2">Yes</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">
                    <code>email</code>
                  </td>
                  <td className="px-3 py-2">Only used if you email tokens</td>
                  <td className="px-3 py-2">No</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-10 cursor-pointer items-center rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-board">
              Choose a CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => void handleFileChosen(event)}
              />
            </label>
            <Button variant="secondary" size="md" onClick={handleSampleDownload}>
              Download a sample CSV
            </Button>
          </div>
          <p className="text-sm text-muted">
            After you choose a file, its students are shown in the list so you can check them before
            adding.
          </p>
        </div>
      )}

      <Button disabled={busy || text.trim() === ''} onClick={onAdd}>
        Add students
      </Button>
    </div>
  );
}
