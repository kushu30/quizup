import {
  MAX_CSV_IMPORT_ROWS,
  questionInputSchema,
  type QuestionInput,
  type RowError,
} from './api.js';

export const QUESTION_CSV_COLUMNS = [
  'topic',
  'difficulty',
  'stem',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct',
] as const;

export const QUESTION_CSV_TEMPLATE = `${QUESTION_CSV_COLUMNS.join(',')}\n`;

const CORRECT_LETTERS = ['a', 'b', 'c', 'd'];

export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let currentField = '';
  let currentRecord: string[] = [];
  let insideQuotes = false;
  const source = text.startsWith('﻿') ? text.slice(1) : text;

  function endField() {
    currentRecord.push(currentField);
    currentField = '';
  }

  function endRecord() {
    endField();
    records.push(currentRecord);
    currentRecord = [];
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source.charAt(index);

    if (insideQuotes) {
      if (character === '"') {
        if (source.charAt(index + 1) === '"') {
          currentField += '"';
          index += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += character;
      }
      continue;
    }

    if (character === '"') {
      insideQuotes = true;
    } else if (character === ',') {
      endField();
    } else if (character === '\r') {
      if (source.charAt(index + 1) === '\n') {
        index += 1;
      }
      endRecord();
    } else if (character === '\n') {
      endRecord();
    } else {
      currentField += character;
    }
  }

  if (currentField.length > 0 || currentRecord.length > 0) {
    endRecord();
  }

  return records.filter((record) => record.some((field) => field.trim() !== ''));
}

export interface ParsedQuestionsCsv {
  questions: QuestionInput[];
  rowErrors: RowError[];
}

export function parseQuestionsCsv(text: string): ParsedQuestionsCsv {
  const records = parseCsvRecords(text);
  const headerRecord = records[0];
  if (!headerRecord) {
    return { questions: [], rowErrors: [{ row: 1, message: 'CSV is empty' }] };
  }

  const headers = headerRecord.map((header) => header.trim().toLowerCase());
  const missingColumns = QUESTION_CSV_COLUMNS.filter(
    (column) => column !== 'topic' && !headers.includes(column),
  );
  if (missingColumns.length > 0) {
    return {
      questions: [],
      rowErrors: [{ row: 1, message: `Missing columns: ${missingColumns.join(', ')}` }],
    };
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) {
    return { questions: [], rowErrors: [{ row: 1, message: 'CSV has no question rows' }] };
  }
  if (dataRecords.length > MAX_CSV_IMPORT_ROWS) {
    return {
      questions: [],
      rowErrors: [{ row: 1, message: `At most ${MAX_CSV_IMPORT_ROWS} questions per import` }],
    };
  }

  const questions: QuestionInput[] = [];
  const rowErrors: RowError[] = [];

  dataRecords.forEach((record, recordIndex) => {
    const rowNumber = recordIndex + 2;
    const cell = (column: string) => (record[headers.indexOf(column)] ?? '').trim();

    const correctIndex = CORRECT_LETTERS.indexOf(cell('correct').toLowerCase());
    if (correctIndex === -1) {
      rowErrors.push({ row: rowNumber, message: 'correct must be A, B, C or D' });
      return;
    }

    const parsed = questionInputSchema.safeParse({
      topic: cell('topic'),
      difficulty: cell('difficulty').toLowerCase(),
      stem: cell('stem'),
      options: [cell('option_a'), cell('option_b'), cell('option_c'), cell('option_d')],
      correct_index: correctIndex,
    });

    if (parsed.success) {
      questions.push(parsed.data);
      return;
    }
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`)
      .join('; ');
    rowErrors.push({ row: rowNumber, message });
  });

  return { questions, rowErrors };
}
