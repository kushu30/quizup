import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from '../lib/download';
import { CsvImport } from './CsvImport';

vi.mock('../lib/api', () => ({
  ApiError: class extends Error {
    rowErrors: unknown[] = [];
  },
  describeError: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong',
  api: { importQuestions: vi.fn() },
}));
vi.mock('../lib/download', () => ({ saveBlob: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CsvImport sample', () => {
  it('lets the host download a sample that shows exactly how to fill the columns', async () => {
    render(<CsvImport quizId="q" onImported={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download a sample CSV' }));
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveBlob).mock.calls[0]?.[1]).toBe('quizup-sample-questions.csv');
    const blob = vi.mocked(saveBlob).mock.calls[0]?.[0] as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text.startsWith('topic,difficulty,stem,option_a')).toBe(true);
  });
});
