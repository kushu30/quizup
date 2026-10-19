import { QUESTION_CSV_COLUMNS, type RowError } from '@quizup/shared';
import { useState, type ChangeEvent } from 'react';
import { ApiError, api, describeError } from '../lib/api';

interface CsvImportProps {
  quizId: string;
  onImported: () => void;
}

export function CsvImport({ quizId, onImported }: CsvImportProps) {
  const [message, setMessage] = useState<string | null>(null);
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
      const result = await api.importQuestions(quizId, await file.text());
      setMessage(`Imported ${result.imported} questions`);
      onImported();
    } catch (error) {
      setMessage(describeError(error));
      if (error instanceof ApiError) {
        setRowErrors(error.rowErrors);
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-medium">Import from CSV</h3>
      <p className="text-sm text-slate-600">
        Header row: <code>{QUESTION_CSV_COLUMNS.join(',')}</code>. Difficulty is easy, medium or
        hard. Correct is A, B, C or D. If any row is invalid nothing is imported.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        disabled={importing}
        onChange={(event) => void handleFileChosen(event)}
      />
      {message && <p className="text-sm text-slate-800">{message}</p>}
      {rowErrors.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-red-700">
          {rowErrors.map((rowError) => (
            <li key={`${rowError.row}-${rowError.message}`}>
              Row {rowError.row}: {rowError.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
