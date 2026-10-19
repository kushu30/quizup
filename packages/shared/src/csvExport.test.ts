import { describe, expect, it } from 'vitest';
import { buildParticipantsCsv, buildResponsesCsv, escapeCsvCell, toCsv } from './csvExport.js';
import type { AnalyticsSnapshot } from './analytics.js';

describe('escapeCsvCell', () => {
  it('leaves plain text alone and renders empty values as empty', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('quotes cells with commas, quotes and line breaks and doubles inner quotes', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(escapeCsvCell('line\r\nbreak')).toBe('"line\r\nbreak"');
  });

  it('prefixes cells that start with = + - or @ with a single quote', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('+1')).toBe("'+1");
    expect(escapeCsvCell('-1')).toBe("'-1");
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('combines the injection prefix with quoting', () => {
    expect(escapeCsvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });

  it('does not prefix text that merely contains those characters', () => {
    expect(escapeCsvCell('a=b')).toBe('a=b');
  });

  it('writes numbers and booleans as they are', () => {
    expect(escapeCsvCell(-5)).toBe('-5');
    expect(escapeCsvCell(3.5)).toBe('3.5');
    expect(escapeCsvCell(Number.NaN)).toBe('');
    expect(escapeCsvCell(true)).toBe('true');
  });
});

describe('toCsv', () => {
  it('joins rows with CRLF and ends with a line break', () => {
    expect(
      toCsv([
        ['a', 'b'],
        [1, null],
      ]),
    ).toBe('a,b\r\n1,\r\n');
  });
});

const snapshot: AnalyticsSnapshot = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  source: 'live',
  status: 'ended',
  generatedAtMs: 0,
  adaptive: true,
  totalRounds: 2,
  roundsCompleted: 2,
  currentRound: 2,
  checkpointRound: 1,
  topics: [
    { key: 'algebra', label: 'Algebra' },
    { key: 'geometry', label: 'Geometry' },
  ],
  questions: [],
  sessionHistogram: new Array<number>(10).fill(0),
  currentRoundHistogram: new Array<number>(10).fill(0),
  participants: [
    {
      participantId: '22222222-2222-4222-8222-222222222222',
      displayName: '=evil()',
      rank: 2,
      score: 400,
      answered: 2,
      correct: 1,
      avgResponseMs: 1500.4,
      rating: 1003.6,
      projection: null,
      checkpointProjection: null,
      mastery: [0.5, null],
    },
    {
      participantId: '33333333-3333-4333-8333-333333333333',
      displayName: 'Ada',
      rank: 1,
      score: 1800,
      answered: 2,
      correct: 2,
      avgResponseMs: 900,
      rating: 1031,
      projection: null,
      checkpointProjection: null,
      mastery: [0.7097561, 0.3],
    },
  ],
  leaderboard: [],
};

describe('buildParticipantsCsv', () => {
  it('writes ranked rows, an Elo column for adaptive sessions and one mastery column per topic', () => {
    const lines = buildParticipantsCsv(snapshot).trim().split('\r\n');
    expect(lines[0]).toBe(
      'Rank,Name,Final score,Answered,Correct,Accuracy,Avg response ms,Final Elo,Mastery: Algebra,Mastery: Geometry',
    );
    expect(lines[1]).toBe('1,Ada,1800,2,2,1,900,1031,0.7098,0.3');
    expect(lines[2]).toBe("2,'=evil(),400,2,1,0.5,1500,1004,0.5,");
  });

  it('omits the Elo column for non-adaptive sessions', () => {
    const header = buildParticipantsCsv({ ...snapshot, adaptive: false }).split('\r\n')[0];
    expect(header).not.toContain('Final Elo');
  });
});

describe('buildResponsesCsv', () => {
  it('writes the requested columns with escaping', () => {
    const csv = buildResponsesCsv([
      {
        participantName: '@bob',
        questionStem: 'What is 2+2, really?',
        topic: 'Math',
        labeledDifficulty: 'easy',
        chosenOption: 'B. 4',
        correct: true,
        responseMs: 1234,
        points: 900,
        participantEloBefore: 1000.4,
        questionEloBefore: null,
      },
    ]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(
      'Participant,Question,Topic,Labeled difficulty,Chosen option,Correct,Response ms,Points,Participant Elo before,Question Elo before',
    );
    expect(lines[1]).toBe('\'@bob,"What is 2+2, really?",Math,easy,B. 4,true,1234,900,1000,');
  });
});
