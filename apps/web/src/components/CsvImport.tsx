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
import { AuthNotice } from './landing/AuthField';
import { ctaLight, ctaSize } from './landing/cta';

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
    <section aria-label="Import from CSV" className="space-y-5">
      <p className="text-[0.9375rem] leading-relaxed text-night/60">
        Upload a spreadsheet saved as CSV. Difficulty is easy, medium or hard, and correct is A, B,
        C or D. If any row is invalid, nothing is imported and the rows are listed below.
      </p>
      <div className="rounded-xl bg-night/[0.03] p-4 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.06)]">
        <p className="text-sm font-medium text-night">Header row</p>
        <code className="mt-2 block font-geist-mono text-[0.8125rem] leading-relaxed break-all text-night/70">
          {QUESTION_CSV_COLUMNS.join(',')}
        </code>
        <button
          type="button"
          onClick={() =>
            saveBlob(
              new Blob([SAMPLE_QUESTIONS_CSV], { type: 'text/csv;charset=utf-8' }),
              SAMPLE_QUESTIONS_FILENAME,
            )
          }
          className={`${ctaLight} ${ctaSize.sm} mt-4`}
        >
          Download a sample CSV
        </button>
      </div>
      <label className="block space-y-2">
        <span className="block text-sm font-medium text-night">CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={importing}
          onChange={(event) => void handleFileChosen(event)}
          className="block w-full text-sm text-night/55 file:mr-3 file:h-10 file:cursor-pointer file:rounded-[0.8rem] file:border-0 file:bg-night file:px-4 file:text-sm file:font-medium file:text-white file:transition-[filter] hover:file:brightness-125 disabled:opacity-50"
        />
      </label>
      {importing && (
        <p role="status" className="text-sm text-night/55">
          Importing...
        </p>
      )}
      {message && (
        <AuthNotice tone={message.ok ? 'info' : 'danger'}>
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
        </AuthNotice>
      )}
    </section>
  );
}
