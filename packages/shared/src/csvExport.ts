import type { AnalyticsSnapshot } from './analytics.js';
import type { Difficulty } from './enums.js';

export type CsvCell = string | number | boolean | null | undefined;

const INJECTION_PREFIX_PATTERN = /^[=+\-@]/;
const NEEDS_QUOTING_PATTERN = /[",\r\n]/;

export function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  const protectedText = INJECTION_PREFIX_PATTERN.test(value) ? `'${value}` : value;
  return NEEDS_QUOTING_PATTERN.test(protectedText)
    ? `"${protectedText.replace(/"/g, '""')}"`
    : protectedText;
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return `${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export function formatChosenOption(options: readonly string[], chosenIndex: number): string {
  const letter = OPTION_LETTERS[chosenIndex] ?? String(chosenIndex);
  return `${letter}. ${options[chosenIndex] ?? ''}`;
}

export function buildParticipantsCsv(summary: AnalyticsSnapshot): string {
  const includeRating = summary.adaptive;
  const header: CsvCell[] = [
    'Rank',
    'Name',
    'Final score',
    'Answered',
    'Correct',
    'Accuracy',
    'Avg response ms',
    ...(includeRating ? ['Final Elo'] : []),
    ...summary.topics.map((topic) => `Mastery: ${topic.label}`),
  ];
  const rows = [...summary.participants]
    .sort((first, second) => first.rank - second.rank)
    .map((participant): CsvCell[] => [
      participant.rank,
      participant.displayName,
      participant.score,
      participant.answered,
      participant.correct,
      participant.answered === 0
        ? null
        : Number((participant.correct / participant.answered).toFixed(4)),
      participant.avgResponseMs === null ? null : Math.round(participant.avgResponseMs),
      ...(includeRating
        ? [participant.rating === null ? null : Math.round(participant.rating)]
        : []),
      ...summary.topics.map((_topic, index) => {
        const mastery = participant.mastery[index] ?? null;
        return mastery === null ? null : Number(mastery.toFixed(4));
      }),
    ]);
  return toCsv([header, ...rows]);
}

export interface ExportResponseRow {
  participantName: string;
  questionStem: string;
  topic: string;
  labeledDifficulty: Difficulty;
  chosenOption: string;
  correct: boolean;
  responseMs: number;
  points: number;
  participantEloBefore: number | null;
  questionEloBefore: number | null;
}

export function buildResponsesCsv(rows: readonly ExportResponseRow[]): string {
  const header: CsvCell[] = [
    'Participant',
    'Question',
    'Topic',
    'Labeled difficulty',
    'Chosen option',
    'Correct',
    'Response ms',
    'Points',
    'Participant Elo before',
    'Question Elo before',
  ];
  return toCsv([
    header,
    ...rows.map((row): CsvCell[] => [
      row.participantName,
      row.questionStem,
      row.topic,
      row.labeledDifficulty,
      row.chosenOption,
      row.correct,
      row.responseMs,
      row.points,
      row.participantEloBefore === null ? null : Math.round(row.participantEloBefore),
      row.questionEloBefore === null ? null : Math.round(row.questionEloBefore),
    ]),
  ]);
}
