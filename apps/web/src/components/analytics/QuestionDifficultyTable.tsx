import {
  PROVISIONAL_QUESTION_ANSWERS,
  type DifficultyMismatch,
  type QuestionAnalytics,
} from '@quizup/shared';
import { memo } from 'react';
import { useStableRows } from '../../lib/stableRows';

interface QuestionDifficultyTableProps {
  questions: QuestionAnalytics[];
  showMedian?: boolean;
}

const MISMATCH_TEXT: Record<DifficultyMismatch, string> = {
  harder_than_labeled: 'Harder than labeled',
  easier_than_labeled: 'Easier than labeled',
};

const QuestionRow = memo(function QuestionRow({
  question,
  showMedian,
}: {
  question: QuestionAnalytics;
  showMedian: boolean;
}) {
  return (
    <tr>
      <td className="px-3 py-2 tabular-nums">{question.round}</td>
      <td className="max-w-xs truncate px-3 py-2" title={question.stem}>
        {question.stem}
      </td>
      <td className="px-3 py-2">{question.topic}</td>
      <td className="px-3 py-2 capitalize">
        {question.labeledDifficulty}
        {question.provisional && (
          <span
            title={`Fewer than ${PROVISIONAL_QUESTION_ANSWERS} responses so far: this question's rating is still settling`}
            className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs normal-case text-slate-700 dark:bg-slate-700 dark:text-slate-100"
          >
            provisional
          </span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">
        {question.accuracy === null
          ? '-'
          : `${Math.round(question.accuracy * 100)}% (${question.correct}/${question.answered})`}
      </td>
      {showMedian && (
        <td className="px-3 py-2 tabular-nums">
          {question.medianResponseMs === null
            ? '-'
            : `${(question.medianResponseMs / 1000).toFixed(1)} s`}
        </td>
      )}
      <td className="px-3 py-2">
        {question.mismatch ? (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {'⚠ '}
            {MISMATCH_TEXT[question.mismatch]}
          </span>
        ) : (
          <span className="text-slate-400">-</span>
        )}
      </td>
    </tr>
  );
});

export function QuestionDifficultyTable({
  questions,
  showMedian = false,
}: QuestionDifficultyTableProps) {
  const stableQuestions = useStableRows(questions, (question) => question.questionId);
  if (stableQuestions.length === 0) {
    return <p className="text-slate-500">No questions served yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          <tr>
            <th className="px-3 py-2">Round</th>
            <th className="px-3 py-2">Question</th>
            <th className="px-3 py-2">Topic</th>
            <th className="px-3 py-2">Labeled</th>
            <th className="px-3 py-2">Observed accuracy</th>
            {showMedian && <th className="px-3 py-2">Median time</th>}
            <th className="px-3 py-2">Check</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {stableQuestions.map((question) => (
            <QuestionRow key={question.questionId} question={question} showMedian={showMedian} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
