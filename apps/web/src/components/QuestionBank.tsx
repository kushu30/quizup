import type { ApprovalFilter, Difficulty, Question } from '@quizup/shared';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { api, describeError } from '../lib/api';
import { useAutoDismiss } from '../lib/useAutoDismiss';
import { AuthNotice } from './landing/AuthField';
import { ctaQuiet, ctaQuietDanger, ctaSize, ctaSoft } from './landing/cta';
import { RULE } from './landing/frame';
import { AppIcon, ICONS } from './app/icons';
import { QuestionForm } from './QuestionForm';
import { Dropdown } from './ui/Dropdown';
import { Tooltip } from './ui/Tooltip';

interface QuestionBankProps {
  quizId?: string;
  lockedApproval?: ApprovalFilter;
  emptyMessage?: string;
  refreshKey?: number;
  onChanged?: () => void;
  // Runs the rows from edge to edge of the page frame, with the page's side padding inside.
  edge?: boolean;
  // A short list for narrow spaces: one line per question, with its answers a click away.
  compact?: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};
const DIFFICULTY_DOTS: Record<Difficulty, string> = {
  easy: 'bg-emerald-500',
  medium: 'bg-amber-500',
  hard: 'bg-rose-500',
};

// Questions sit in a grid of cells split by dashed rules, as in the landing page's bento,
// with as many columns as the space allows. The grid overhangs its box by a pixel on the
// right and bottom so the outer cells' rules hide under the box edge.
const GRID = '-mr-px -mb-px grid grid-cols-1 @3xl:grid-cols-2 @7xl:grid-cols-3';
const CELL = 'min-w-0 border-r border-b border-dashed border-night/15';

const COMPACT_ACTION =
  'flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-200 ease-soft hover:bg-night/[0.05]';

const TAG_TONES = {
  plain: 'bg-night/[0.05] text-night/65',
  violet: 'bg-violet-50 text-violet-800 shadow-[inset_0_0_0_1px_var(--color-violet-200)]',
  green: 'bg-accent-50 text-accent-800 shadow-[inset_0_0_0_1px_var(--color-accent-200)]',
  amber: 'bg-amber-50 text-amber-900 shadow-[inset_0_0_0_1px_var(--color-amber-200)]',
};

function Tag({ tone = 'plain', children }: { tone?: keyof typeof TAG_TONES; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.8125rem] font-medium ${TAG_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function QuestionBank({
  quizId,
  lockedApproval,
  emptyMessage = 'No questions found',
  refreshKey = 0,
  onChanged,
  edge = false,
  compact = false,
}: QuestionBankProps) {
  const searchId = useId();
  const pad = edge ? 'px-4 sm:px-10' : '';
  // Cells in the page run to the rails, so they take the page's inset; in a card, a smaller one.
  const cellPad = edge ? 'px-4 py-6 sm:px-10 sm:py-7' : 'py-5 @3xl:px-5';
  const [questions, setQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | ''>('');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter | ''>('');
  const approval = lockedApproval ?? (approvalFilter || undefined);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const messageFading = useAutoDismiss(message, () => setMessage(null));
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  // Questions are not stamped with when they were added, so the short list orders them by when
  // this page first saw them: the ones loaded at the start keep the server's order, and any
  // added, imported, generated or approved since come first.
  const seenAt = useRef(new Map<string, number>());
  const loadedOnce = useRef(false);
  const arrivals = useRef(0);

  function toggleOpen(questionId: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (!next.delete(questionId)) {
        next.add(questionId);
      }
      return next;
    });
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedSearch(searchText), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [searchText]);

  const load = useCallback(async () => {
    try {
      const [nextQuestions, nextTopics] = await Promise.all([
        api.listQuestions({
          quizId,
          search: debouncedSearch || undefined,
          topic: topicFilter || undefined,
          difficulty: difficultyFilter || undefined,
          approval,
        }),
        api.listTopics(quizId),
      ]);
      const initial = !loadedOnce.current;
      loadedOnce.current = true;
      for (const question of nextQuestions) {
        if (!seenAt.current.has(question.id)) {
          seenAt.current.set(question.id, initial ? 0 : ++arrivals.current);
        }
      }
      setQuestions(nextQuestions);
      setTopics(nextTopics);
      setMessage(null);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setLoading(false);
    }
  }, [quizId, debouncedSearch, topicFilter, difficultyFilter, approval]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleApproval(questionId: string, approve: boolean) {
    try {
      if (approve) {
        await api.approveQuestion(questionId);
      } else {
        await api.unapproveQuestion(questionId);
      }
      await load();
      onChanged?.();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function handleDelete(questionId: string) {
    try {
      await api.deleteQuestion(questionId);
      await load();
      onChanged?.();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  const shown = compact
    ? [...questions].sort(
        (a, b) => (seenAt.current.get(b.id) ?? 0) - (seenAt.current.get(a.id) ?? 0),
      )
    : questions;

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Search
          </label>
          <AppIcon
            size={16}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-night/35"
          >
            {ICONS.search}
          </AppIcon>
          <input
            id={searchId}
            type="search"
            placeholder="Search questions"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="h-10 w-full rounded-[0.8rem] bg-white pr-3.5 pl-10 text-[0.9375rem] text-night shadow-[0_0_0_1px_rgba(17,16,20,0.12)] transition-shadow duration-200 ease-soft placeholder:text-night/40 hover:shadow-[0_0_0_1px_rgba(17,16,20,0.25)] focus:shadow-[0_0_0_2px_var(--color-accent-500)] focus:outline-none"
          />
        </div>

        {message && (
          <AuthNotice tone="danger" fading={messageFading} onDismiss={() => setMessage(null)}>
            {message}
          </AuthNotice>
        )}

        <div className="h-[24rem] overflow-y-auto rounded-xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.09)]">
          {loading && (
            <>
              <span role="status" className="sr-only">
                Loading...
              </span>
              <div aria-hidden="true" className="divide-y divide-dashed divide-night/15">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="space-y-2 px-4 py-4">
                    <div className="h-4 w-3/4 animate-shimmer rounded bg-night/[0.06]" />
                    <div className="h-3 w-1/3 animate-shimmer rounded bg-night/[0.04]" />
                  </div>
                ))}
              </div>
            </>
          )}
          {!loading && questions.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <AppIcon size={24} className="text-night/30">
                {ICONS.questions}
              </AppIcon>
              <p className="max-w-xs text-sm leading-relaxed text-night/55">{emptyMessage}</p>
            </div>
          )}
          {questions.length > 0 && (
            <ul className="divide-y divide-dashed divide-night/15">
              {shown.map((question, index) => {
                const open = openIds.has(question.id);
                if (editingQuestionId === question.id) {
                  return (
                    <li key={question.id} className="px-4 py-5">
                      <QuestionForm
                        initialValue={{
                          topic: question.topic,
                          stem: question.stem,
                          options: question.options,
                          correct_index: question.correct_index,
                          difficulty: question.difficulty,
                        }}
                        submitLabel="Save"
                        onCancel={() => setEditingQuestionId(null)}
                        onSubmit={async (input) => {
                          await api.updateQuestion(question.id, input);
                          setEditingQuestionId(null);
                          await load();
                          onChanged?.();
                        }}
                      />
                    </li>
                  );
                }
                return (
                  <li
                    key={question.id}
                    className="group/row relative px-3 py-3 transition-colors duration-200 ease-soft hover:bg-canvas/60"
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={open ? 'Hide answers' : 'Show answers'}
                        onClick={() => toggleOpen(question.id)}
                        className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-1 py-0.5 text-left"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-1 w-6 shrink-0 font-geist-mono text-xs text-night/35 tabular-nums"
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-[0.9375rem] leading-snug font-medium break-words [overflow-wrap:anywhere] ${
                              open ? '' : 'line-clamp-2'
                            }`}
                          >
                            {question.stem}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-night/50">
                            <span>{question.topic}</span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 rounded-full ${DIFFICULTY_DOTS[question.difficulty]}`}
                              />
                              {DIFFICULTY_LABELS[question.difficulty]}
                            </span>
                            {question.source === 'llm' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-violet-700">AI generated</span>
                              </>
                            )}
                          </span>
                        </span>
                        <AppIcon
                          size={16}
                          className={`mt-1 text-night/35 transition-transform duration-200 ease-soft ${
                            open ? 'rotate-180' : ''
                          }`}
                        >
                          {ICONS.chevronDown}
                        </AppIcon>
                      </button>
                      <div className="flex shrink-0 items-center transition-opacity duration-200 ease-soft group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:hover)]:absolute [@media(hover:hover)]:top-2.5 [@media(hover:hover)]:right-2 [@media(hover:hover)]:rounded-xl [@media(hover:hover)]:bg-white [@media(hover:hover)]:p-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:shadow-[0_0_0_1px_rgba(17,16,20,0.1),0_4px_12px_-4px_rgba(17,16,20,0.18)]">
                        <Tooltip label={question.approved ? 'Unapprove' : 'Approve'}>
                          <button
                            type="button"
                            aria-label={question.approved ? 'Unapprove' : 'Approve'}
                            onClick={() => void handleApproval(question.id, !question.approved)}
                            className={`${COMPACT_ACTION} ${
                              question.approved
                                ? 'text-night/45 hover:text-night'
                                : 'text-accent-700 hover:bg-accent-50'
                            }`}
                          >
                            <AppIcon size={16}>
                              {question.approved ? ICONS.undo : ICONS.check}
                            </AppIcon>
                          </button>
                        </Tooltip>
                        <Tooltip label="Edit">
                          <button
                            type="button"
                            aria-label="Edit"
                            onClick={() => setEditingQuestionId(question.id)}
                            className={`${COMPACT_ACTION} text-night/45 hover:text-night`}
                          >
                            <AppIcon size={16}>{ICONS.edit}</AppIcon>
                          </button>
                        </Tooltip>
                        <Tooltip label="Delete">
                          <button
                            type="button"
                            aria-label="Delete"
                            onClick={() => void handleDelete(question.id)}
                            className={`${COMPACT_ACTION} text-night/45 hover:bg-alert-soft hover:text-alert`}
                          >
                            <AppIcon size={16}>{ICONS.trash}</AppIcon>
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                    {open && (
                      <ol className="mt-2.5 ml-[2.125rem] space-y-1">
                        {question.options.map((option, optionIndex) => {
                          const correct = optionIndex === question.correct_index;
                          return (
                            <li
                              key={OPTION_LETTERS[optionIndex]}
                              className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm leading-snug ${
                                correct ? 'bg-accent-50 text-accent-900' : 'text-night/70'
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-geist-mono text-[10px] font-medium ${
                                  correct
                                    ? 'bg-accent-500 text-white'
                                    : 'bg-night/[0.05] text-night/45'
                                }`}
                              >
                                {OPTION_LETTERS[optionIndex]}
                              </span>
                              <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                                {option}
                              </span>
                              {correct && (
                                <span className="mt-px shrink-0 text-accent-600">
                                  <AppIcon size={16}>{ICONS.check}</AppIcon>
                                  <span className="sr-only">Correct</span>
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={`flex flex-col gap-2 lg:flex-row lg:items-center ${pad}`}>
        <div className="relative min-w-0 flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search
          </label>
          <AppIcon
            size={16}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-night/35"
          >
            {ICONS.search}
          </AppIcon>
          <input
            id={searchId}
            type="search"
            placeholder="Search questions or topics"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="h-10 w-full rounded-[0.8rem] bg-white pr-3.5 pl-10 text-[0.9375rem] text-night shadow-[0_0_0_1px_rgba(17,16,20,0.12)] transition-shadow duration-200 ease-soft placeholder:text-night/40 hover:shadow-[0_0_0_1px_rgba(17,16,20,0.25)] focus:shadow-[0_0_0_2px_var(--color-accent-500)] focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Dropdown
            look="modern"
            label="Topic"
            className="sm:w-44"
            value={topicFilter}
            options={[
              { value: '', label: 'All topics' },
              ...topics.map((topic) => ({ value: topic, label: topic })),
            ]}
            onChange={setTopicFilter}
          />
          <Dropdown
            look="modern"
            label="Difficulty"
            className="sm:w-40"
            value={difficultyFilter}
            options={[
              { value: '', label: 'All difficulties' },
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' },
            ]}
            onChange={(next) => setDifficultyFilter(next as Difficulty | '')}
          />
          {!lockedApproval && (
            <Dropdown
              look="modern"
              label="Status"
              className="col-span-2 sm:w-44"
              value={approvalFilter}
              options={[
                { value: '', label: 'Any status' },
                { value: 'approved', label: 'Approved' },
                { value: 'pending', label: 'Pending review' },
              ]}
              onChange={(next) => setApprovalFilter(next as ApprovalFilter | '')}
            />
          )}
        </div>
      </div>

      {message && (
        <div className={`mt-4 ${pad}`}>
          <AuthNotice tone="danger" fading={messageFading} onDismiss={() => setMessage(null)}>
            {message}
          </AuthNotice>
        </div>
      )}

      <div className={`@container mt-6 overflow-hidden border-t ${RULE}`}>
        {loading && (
          <>
            <span role="status" className="sr-only">
              Loading...
            </span>
            <div aria-hidden="true" className={GRID}>
              {[0, 1, 2].map((cell) => (
                <div key={cell} className={`space-y-4 ${CELL} ${cellPad}`}>
                  <div className="h-3.5 w-1/3 animate-shimmer rounded bg-night/[0.06]" />
                  <div className="h-4 w-3/4 animate-shimmer rounded bg-night/[0.06]" />
                  <div className="space-y-1.5">
                    {[0, 1, 2, 3].map((option) => (
                      <div
                        key={option}
                        className="h-9 animate-shimmer rounded-xl bg-night/[0.04]"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {!loading && questions.length === 0 && (
          <div
            className={`flex flex-col items-center text-center ${edge ? 'gap-5 py-16' : 'gap-4 py-10'} ${pad}`}
          >
            <AppIcon size={28} className="text-night/30">
              {ICONS.questions}
            </AppIcon>
            <p className="max-w-sm leading-relaxed text-night/55">{emptyMessage}</p>
          </div>
        )}
        {questions.length > 0 && (
          <ul className={GRID}>
            {questions.map((question, index) =>
              editingQuestionId === question.id ? (
                <li key={question.id} className={`col-span-full ${CELL} ${cellPad}`}>
                  <QuestionForm
                    initialValue={{
                      topic: question.topic,
                      stem: question.stem,
                      options: question.options,
                      correct_index: question.correct_index,
                      difficulty: question.difficulty,
                    }}
                    submitLabel="Save"
                    onCancel={() => setEditingQuestionId(null)}
                    onSubmit={async (input) => {
                      await api.updateQuestion(question.id, input);
                      setEditingQuestionId(null);
                      await load();
                      onChanged?.();
                    }}
                  />
                </li>
              ) : (
                <li
                  key={question.id}
                  className={`flex flex-col transition-colors duration-200 ease-soft hover:bg-canvas/70 ${CELL} ${cellPad}`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="mr-1 font-geist-mono text-[0.8125rem] text-night/35 tabular-nums"
                    >
                      Q{index + 1}
                    </span>
                    <Tag>{question.topic}</Tag>
                    <Tag>
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${DIFFICULTY_DOTS[question.difficulty]}`}
                      />
                      {DIFFICULTY_LABELS[question.difficulty]}
                    </Tag>
                    {question.source === 'llm' && <Tag tone="violet">AI generated</Tag>}
                    <Tag tone={question.approved ? 'green' : 'amber'}>
                      {question.approved ? 'Approved' : 'Pending'}
                    </Tag>
                  </div>
                  <p className="mt-3 text-[1.0625rem] leading-snug font-medium tracking-tight break-words [overflow-wrap:anywhere]">
                    {question.stem}
                  </p>
                  <ol className="mt-4 space-y-1">
                    {question.options.map((option, optionIndex) => {
                      const correct = optionIndex === question.correct_index;
                      return (
                        <li
                          key={OPTION_LETTERS[optionIndex]}
                          className={`flex items-start gap-2.5 rounded-[0.7rem] px-2 py-1.5 text-[0.9375rem] leading-snug ${
                            correct ? 'bg-accent-50 text-accent-900' : 'text-night/75'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-geist-mono text-[10px] font-medium ${
                              correct ? 'bg-accent-500 text-white' : 'bg-night/[0.05] text-night/45'
                            }`}
                          >
                            {OPTION_LETTERS[optionIndex]}
                          </span>
                          <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                            {option}
                          </span>
                          {correct && (
                            <span className="mt-px shrink-0 text-accent-600">
                              <AppIcon size={16}>{ICONS.check}</AppIcon>
                              <span className="sr-only">Correct</span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-auto -mx-3 flex flex-wrap items-center gap-1 pt-4">
                    <button
                      type="button"
                      onClick={() => setEditingQuestionId(question.id)}
                      className={`${ctaQuiet} ${ctaSize.sm}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApproval(question.id, !question.approved)}
                      className={`${question.approved ? ctaQuiet : ctaSoft} ${ctaSize.sm}`}
                    >
                      {question.approved ? 'Unapprove' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(question.id)}
                      className={`${ctaQuietDanger} ${ctaSize.sm}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
