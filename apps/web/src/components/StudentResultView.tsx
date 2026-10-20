import type { StudentResult } from '@quizup/shared';
import { formatDuration, formatPercent } from '../lib/formatDuration';
import { Badge, Notice, Panel, TableFrame } from './ui';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

interface StudentResultViewProps {
  result: StudentResult;
  /** Students are told why correct answers are missing; hosts always have them. */
  audience: 'student' | 'host';
}

export function StudentResultView({ result, audience }: StudentResultViewProps) {
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Score" value={result.score.toLocaleString()} />
        <Stat
          label="Rank"
          value={result.rank === null ? 'None' : `${result.rank} of ${result.participantCount}`}
        />
        <Stat label="Time taken" value={formatDuration(result.timeTakenMs)} />
        <Stat
          label={result.answersShown ? 'Correct' : 'Answered'}
          value={
            result.answersShown
              ? `${result.correct ?? 0} of ${result.totalQuestions} (${formatPercent(result.accuracy)})`
              : `${result.answered} of ${result.totalQuestions}`
          }
        />
      </dl>

      {audience === 'student' && !result.answersShown && (
        <Notice tone="info">
          Your host has chosen not to show which answers were right. You can see your score and what
          you answered.
        </Notice>
      )}

      {result.modules.length > 0 && (
        <Panel title="By module">
          <TableFrame label="Accuracy by module">
            <table aria-label="Accuracy by module">
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  <th scope="col" className="text-right">
                    Correct
                  </th>
                  <th scope="col" className="text-right">
                    Answered
                  </th>
                  <th scope="col" className="text-right">
                    Accuracy
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.modules.map((entry) => (
                  <tr key={entry.module}>
                    <th scope="row" className="font-medium">
                      {entry.module}
                    </th>
                    <td className="text-right tabular-nums">
                      {entry.correct} of {entry.total}
                    </td>
                    <td className="text-right tabular-nums">{entry.answered}</td>
                    <td className="text-right tabular-nums">{formatPercent(entry.accuracy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        </Panel>
      )}

      <Panel title="Question by question">
        {result.questions.length === 0 ? (
          <p className="text-muted">No questions were recorded for this attempt.</p>
        ) : (
          <ol className="space-y-5">
            {result.questions.map((question, index) => (
              <li key={question.questionId} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-muted">Question {index + 1}</span>
                  <Badge tone="neutral">{question.module}</Badge>
                  {question.chosenIndex === null ? (
                    <Badge tone="warning">Not answered</Badge>
                  ) : question.correct === true ? (
                    <Badge tone="success">Correct</Badge>
                  ) : question.correct === false ? (
                    <Badge tone="danger">Incorrect</Badge>
                  ) : null}
                  {question.responseMs !== null && (
                    <span className="text-sm text-muted">
                      {formatDuration(question.responseMs)}
                    </span>
                  )}
                </div>
                <p className="font-medium break-words">{question.stem}</p>
                <ul className="space-y-1">
                  {question.options.map((option, optionIndex) => {
                    const chosen = question.chosenIndex === optionIndex;
                    const correctOption = question.correctIndex === optionIndex;
                    return (
                      <li
                        key={optionIndex}
                        className={`rounded-md border px-3 py-2 text-sm ${
                          correctOption
                            ? 'border-board bg-board-soft'
                            : chosen
                              ? 'border-rule-strong bg-paper'
                              : 'border-rule'
                        }`}
                      >
                        <span className="break-words">{option}</span>
                        {chosen && (
                          <span className="ml-2 font-semibold">
                            {audience === 'student' ? 'Your answer' : 'Chosen'}
                          </span>
                        )}
                        {correctOption && (
                          <span className="ml-2 font-semibold text-board">Correct answer</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
