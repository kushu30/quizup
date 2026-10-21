import type { StudentResult } from '@quizup/shared';
import { formatDuration, formatPercent } from '../lib/formatDuration';
import { Badge, Notice, Panel, TableFrame } from './ui';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <dt className="text-sm text-night/55">{label}</dt>
      <dd className="mt-1 font-geist-mono text-xl font-medium tracking-tight tabular-nums sm:text-2xl">
        {value}
      </dd>
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
    <div className="space-y-4">
      <dl className="grid grid-cols-2 divide-night/15 overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_1px_3px_rgba(17,16,20,0.05)] lg:grid-cols-4 [&>*]:border-dashed [&>*]:border-night/15 [&>:nth-child(2n)]:border-l [&>:nth-child(n+3)]:border-t lg:[&>:nth-child(n+3)]:border-t-0 lg:[&>:not(:first-child)]:border-l">
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
          <p className="text-night/55">No questions were recorded for this attempt.</p>
        ) : (
          <ol className="-mx-4 divide-y divide-dashed divide-night/15 sm:-mx-5">
            {result.questions.map((question, index) => (
              <li key={question.questionId} className="space-y-2.5 px-4 py-5 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-geist-mono text-xs text-night/45">
                    Question {index + 1}
                  </span>
                  <Badge tone="neutral">{question.module}</Badge>
                  {question.chosenIndex === null ? (
                    <Badge tone="warning">Not answered</Badge>
                  ) : question.correct === true ? (
                    <Badge tone="success">Correct</Badge>
                  ) : question.correct === false ? (
                    <Badge tone="danger">Incorrect</Badge>
                  ) : null}
                  {question.responseMs !== null && (
                    <span className="font-geist-mono text-xs text-night/50">
                      {formatDuration(question.responseMs)}
                    </span>
                  )}
                </div>
                <p className="font-medium break-words [overflow-wrap:anywhere]">{question.stem}</p>
                <ul className="space-y-1.5">
                  {question.options.map((option, optionIndex) => {
                    const chosen = question.chosenIndex === optionIndex;
                    const correctOption = question.correctIndex === optionIndex;
                    return (
                      <li
                        key={optionIndex}
                        className={`rounded-xl px-3 py-2 text-sm ${
                          correctOption
                            ? 'bg-accent-50 shadow-[inset_0_0_0_1px_var(--color-accent-300)]'
                            : chosen
                              ? 'bg-night/[0.04] shadow-[inset_0_0_0_1px_rgba(17,16,20,0.3)]'
                              : 'shadow-[inset_0_0_0_1px_rgba(17,16,20,0.1)]'
                        }`}
                      >
                        <span className="break-words [overflow-wrap:anywhere]">{option}</span>
                        {chosen && (
                          <span className="ml-2 font-medium">
                            {audience === 'student' ? 'Your answer' : 'Chosen'}
                          </span>
                        )}
                        {correctOption && (
                          <span className="ml-2 font-medium text-accent-700">Correct answer</span>
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
