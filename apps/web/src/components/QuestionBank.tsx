import type { ApprovalFilter, Difficulty, Question } from '@quizup/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, describeError } from '../lib/api';
import { QuestionForm } from './QuestionForm';
import { QuestionImage } from './QuestionImage';
import { Badge, Button, Notice, PageLoader, SelectField, TextField } from './ui';

interface QuestionBankProps {
  quizId?: string;
  lockedApproval?: ApprovalFilter;
  emptyMessage?: string;
  refreshKey?: number;
  onChanged?: () => void;
  ordered?: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export function QuestionBank({
  quizId,
  lockedApproval,
  emptyMessage = 'No questions found',
  refreshKey = 0,
  onChanged,
  ordered = false,
}: QuestionBankProps) {
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

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

  const filtersActive = Boolean(debouncedSearch || topicFilter || difficultyFilter);
  const orderable = ordered && Boolean(quizId) && approval === 'approved';
  const canReorder = orderable && !filtersActive && questions.length > 1;

  async function saveOrder(next: Question[]) {
    const previous = questions;
    setQuestions(next);
    try {
      await api.reorderQuestions(
        quizId ?? '',
        next.map((question) => question.id),
      );
      onChanged?.();
    } catch (error) {
      setQuestions(previous);
      setMessage(describeError(error));
    }
  }

  async function moveBy(question: Question, step: -1 | 1) {
    const from = questions.findIndex((candidate) => candidate.id === question.id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= questions.length) {
      return;
    }
    const next = [...questions];
    next.splice(to, 0, ...next.splice(from, 1));
    await saveOrder(next);
  }

  async function handleDrop(targetId: string) {
    const draggedId = dragId;
    setDragId(null);
    if (!draggedId || draggedId === targetId) {
      return;
    }
    const dragged = questions.find((candidate) => candidate.id === draggedId);
    const to = questions.findIndex((candidate) => candidate.id === targetId);
    if (!dragged || to < 0) {
      return;
    }
    const next = questions.filter((candidate) => candidate.id !== draggedId);
    next.splice(to, 0, dragged);
    await saveOrder(next);
  }

  const groups = useMemo(() => {
    const byModule = new Map<string, Question[]>();
    for (const question of questions) {
      byModule.set(question.topic, [...(byModule.get(question.topic) ?? []), question]);
    }
    return [...byModule.entries()];
  }, [questions]);

  function toggle(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }

  async function handleMove() {
    try {
      await api.moveQuestions([...selected], moveTarget.trim());
      setSelected(new Set());
      setMoveTarget('');
      await load();
      onChanged?.();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

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

  function renderRow(question: Question, index: number) {
    return editingQuestionId === question.id ? (
      <li key={question.id} className="py-4">
        <div className="rounded-lg border border-board/40 bg-board-soft/40 p-4">
          <QuestionForm
            modules={topics}
            initialValue={{
              topic: question.topic,
              stem: question.stem,
              options: question.options,
              correct_index: question.correct_index,
              difficulty: question.difficulty,
              image_url: question.image_url ?? null,
              image_alt: question.image_alt ?? null,
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
        </div>
      </li>
    ) : (
      <li
        key={question.id}
        className="space-y-3 py-4"
        aria-label={ordered ? question.stem : undefined}
        draggable={canReorder}
        onDragStart={canReorder ? () => setDragId(question.id) : undefined}
        onDragOver={canReorder ? (event) => event.preventDefault() : undefined}
        onDrop={canReorder ? () => void handleDrop(question.id) : undefined}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <label className="flex min-w-0 items-start gap-3 font-semibold break-words">
            <input
              type="checkbox"
              className="mt-1.5 h-4 w-4 shrink-0 accent-board"
              aria-label={`Select ${question.stem}`}
              checked={selected.has(question.id)}
              onChange={(event) => toggle([question.id], event.target.checked)}
            />
            {ordered && (
              <span aria-hidden="true" className="w-6 shrink-0 text-muted">
                {index + 1}.
              </span>
            )}
            <span className="min-w-0">{question.stem}</span>
          </label>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {ordered && <Badge>{question.topic}</Badge>}
            <Badge>{DIFFICULTY_LABELS[question.difficulty]}</Badge>
            {question.source === 'llm' && <Badge tone="brand">AI generated</Badge>}
            <Badge tone={question.approved ? 'success' : 'warning'}>
              {question.approved ? 'Approved' : 'Pending'}
            </Badge>
          </div>
        </div>
        <QuestionImage
          imageUrl={question.image_url}
          imageAlt={question.image_alt}
          className="max-h-32"
        />
        <ol className="grid gap-1.5 text-sm sm:grid-cols-2">
          {question.options.map((option, optionIndex) => {
            const correct = optionIndex === question.correct_index;
            return (
              <li
                key={OPTION_LETTERS[optionIndex]}
                className={`flex items-start gap-2 rounded-md px-2 py-1 ${
                  correct ? 'bg-success-soft font-medium text-success' : 'text-ink'
                }`}
              >
                <span aria-hidden="true" className="w-4 shrink-0 font-semibold text-muted">
                  {OPTION_LETTERS[optionIndex]}
                </span>
                <span className="min-w-0 break-words">{option}</span>
                {correct && <span className="ml-auto shrink-0 text-xs">Correct</span>}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditingQuestionId(question.id)}>
            Edit
          </Button>
          <Button
            variant={question.approved ? 'secondary' : 'brand'}
            size="sm"
            onClick={() => void handleApproval(question.id, !question.approved)}
          >
            {question.approved ? 'Unapprove' : 'Approve'}
          </Button>
          <Button variant="danger" size="sm" onClick={() => void handleDelete(question.id)}>
            Delete
          </Button>
          {canReorder && (
            <span className="ml-auto flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Move ${question.stem} up`}
                disabled={index === 0}
                onClick={() => void moveBy(question, -1)}
              >
                Move up
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Move ${question.stem} down`}
                disabled={index === questions.length - 1}
                onClick={() => void moveBy(question, 1)}
              >
                Move down
              </Button>
            </span>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={`grid gap-3 sm:grid-cols-2 ${lockedApproval ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}
      >
        <TextField
          label="Search"
          type="search"
          placeholder="Question or module"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <SelectField
          label="Module"
          value={topicFilter}
          onChange={(event) => setTopicFilter(event.target.value)}
        >
          <option value="">All modules</option>
          {topics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Difficulty"
          value={difficultyFilter}
          onChange={(event) => setDifficultyFilter(event.target.value as Difficulty | '')}
        >
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </SelectField>
        {!lockedApproval && (
          <SelectField
            label="Status"
            value={approvalFilter}
            onChange={(event) => setApprovalFilter(event.target.value as ApprovalFilter | '')}
          >
            <option value="">Approved and pending</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending review</option>
          </SelectField>
        )}
      </div>
      {message && <Notice tone="danger">{message}</Notice>}
      {loading && <PageLoader label="Loading..." compact />}
      {!loading && questions.length === 0 && (
        <p className="rounded-md border border-dashed border-rule-strong px-4 py-6 text-center text-muted">
          {emptyMessage}
        </p>
      )}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-end gap-3 rounded-lg border border-board/40 bg-board-soft p-3">
          <p className="pb-2 text-sm font-semibold">{selected.size} selected</p>
          <TextField
            label="Move to module"
            list="module-move-options"
            placeholder="For example, Module 2"
            className="min-w-48 flex-1"
            value={moveTarget}
            onChange={(event) => setMoveTarget(event.target.value)}
          />
          <datalist id="module-move-options">
            {topics.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Button disabled={moveTarget.trim() === ''} onClick={() => void handleMove()}>
            Move
          </Button>
          <Button variant="secondary" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}
      {orderable && filtersActive && (
        <p className="text-sm text-muted">Clear the search and filters to change the order.</p>
      )}
      {canReorder && (
        <p className="text-sm text-muted">
          Students get the questions in this order. Drag a question or use Move up and Move down.
        </p>
      )}
      {ordered && questions.length > 0 && (
        <ul className="divide-y divide-rule border-y border-rule">
          {questions.map((question, index) => renderRow(question, index))}
        </ul>
      )}
      {!ordered &&
        groups.map(([moduleName, moduleQuestions]) => (
          <section key={moduleName} aria-label={`Module ${moduleName}`} className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">
                {moduleName} ({moduleQuestions.length})
              </h3>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-board"
                  aria-label={`Select all in ${moduleName}`}
                  checked={moduleQuestions.every((question) => selected.has(question.id))}
                  onChange={(event) =>
                    toggle(
                      moduleQuestions.map((question) => question.id),
                      event.target.checked,
                    )
                  }
                />
                Select all
              </label>
            </div>
            <ul className="divide-y divide-rule border-y border-rule">
              {moduleQuestions.map((question, index) => renderRow(question, index))}
            </ul>
          </section>
        ))}
    </div>
  );
}
