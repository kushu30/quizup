import {
  PROVISIONAL_QUESTION_ANSWERS,
  type DifficultyMismatch,
  type QuestionAnalytics,
} from '@quizup/shared';
import { memo } from 'react';
import { useStableRows } from '../../lib/stableRows';
import { Badge, TableFrame } from '../ui';

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
      <td className="text-muted tabular-nums">{question.round}</td>
      <td className="max-w-[10rem] truncate font-medium" title={question.stem}>
        {question.stem}
      </td>
      <td>{question.topic}</td>
      <td className="whitespace-nowrap capitalize">
        {question.labeledDifficulty}
        {question.provisional && (
          <span className="ml-2 normal-case">
            <Badge
              title={`Fewer than ${PROVISIONAL_QUESTION_ANSWERS} responses so far: this question's rating is still settling`}
            >
              provisional
            </Badge>
          </span>
        )}
      </td>
      <td className="whitespace-nowrap tabular-nums">
        {question.accuracy === null
          ? '-'
          : `${Math.round(question.accuracy * 100)}% (${question.correct}/${question.answered})`}
      </td>
      {showMedian && (
        <td className="whitespace-nowrap tabular-nums">
          {question.medianResponseMs === null
            ? '-'
            : `${(question.medianResponseMs / 1000).toFixed(1)} s`}
        </td>
      )}
      <td className="whitespace-nowrap">
        {question.mismatch ? (
          <Badge tone="warning">
            {'⚠ '}
            {MISMATCH_TEXT[question.mismatch]}
          </Badge>
        ) : (
          <span className="text-muted">-</span>
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
    return <p className="text-muted">No questions served yet.</p>;
  }
  return (
    <TableFrame label="Question difficulty table">
      <table>
        <thead>
          <tr>
            <th scope="col">Round</th>
            <th scope="col">Question</th>
            <th scope="col">Topic</th>
            <th scope="col">Labeled</th>
            <th scope="col">Observed accuracy</th>
            {showMedian && <th scope="col">Median time</th>}
            <th scope="col">Check</th>
          </tr>
        </thead>
        <tbody>
          {stableQuestions.map((question) => (
            <QuestionRow key={question.questionId} question={question} showMedian={showMedian} />
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
