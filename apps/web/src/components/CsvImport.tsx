import {
  QUESTION_CSV_COLUMNS,
  SAMPLE_QUESTIONS_CSV,
  SAMPLE_QUESTIONS_FILENAME,
  type RowError,
} from '@quizup/shared';
import { useState, type ChangeEvent } from 'react';
import { ApiError, api, describeError } from '../lib/api';
import { saveBlob } from '../lib/download';
import { readFileText } from '../lib/readFile';
import { Button, Notice } from './ui';

interface CsvImportProps {
  quizId: string;
  onImported: () => void;
}

export function CsvImport({ quizId, onImported }: CsvImportProps) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [importing, setImporting] = useState(false);

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setImporting(true);
    setMessage(null);
    setRowErrors([]);
    try {
      const result = await api.importQuestions(quizId, await readFileText(file));
      setMessage({ text: `Imported ${result.imported} questions`, ok: true });
      onImported();
    } catch (error) {
      setMessage({ text: describeError(error), ok: false });
      if (error instanceof ApiError) {
        setRowErrors(error.rowErrors);
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <section aria-labelledby="csv-import-heading" className="space-y-3">
      <div className="space-y-1">
        <h3 id="csv-import-heading" className="text-base font-semibold">
          Import from CSV
        </h3>
        <p className="text-sm text-muted">
          Header row:{' '}
          <code className="rounded bg-paper px-1.5 py-0.5 text-xs break-all text-ink">
            {QUESTION_CSV_COLUMNS.join(',')}
          </code>
          . Difficulty is easy, medium or hard. Correct is A, B, C or D. If any row is invalid
          nothing is imported.
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          saveBlob(
            new Blob([SAMPLE_QUESTIONS_CSV], { type: 'text/csv;charset=utf-8' }),
            SAMPLE_QUESTIONS_FILENAME,
          )
        }
      >
        Download a sample CSV
      </Button>
      <label className="block text-sm font-medium">
        CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={importing}
          onChange={(event) => void handleFileChosen(event)}
          className="mt-1.5 block w-full text-sm text-muted file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-md file:border file:border-rule-strong file:bg-surface file:px-4 file:text-sm file:font-semibold file:text-ink hover:file:bg-paper disabled:opacity-50"
        />
      </label>
      {importing && (
        <p role="status" className="text-sm text-muted">
          Importing...
        </p>
      )}
      {message && (
        <Notice tone={message.ok ? 'success' : 'danger'}>
          <p>{message.text}</p>
          {rowErrors.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {rowErrors.map((rowError) => (
                <li key={`${rowError.row}-${rowError.message}`}>
                  Row {rowError.row}: {rowError.message}
                </li>
              ))}
            </ul>
          )}
        </Notice>
      )}
    </section>
  );
}
