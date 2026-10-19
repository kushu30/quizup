import type { ApprovalFilter, Difficulty, Question } from '@quizup/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '../lib/api';
import { QuestionForm } from './QuestionForm';
import { Badge, Button, Notice, SelectField, TextField } from './ui';

interface QuestionBankProps {
  quizId?: string;
  lockedApproval?: ApprovalFilter;
  emptyMessage?: string;
  refreshKey?: number;
  onChanged?: () => void;
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

  return (
    <div className="space-y-4">
      <div
        className={`grid gap-3 sm:grid-cols-2 ${lockedApproval ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}
      >
        <TextField
          label="Search"
          type="search"
          placeholder="Question or topic"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <SelectField
          label="Topic"
          value={topicFilter}
          onChange={(event) => setTopicFilter(event.target.value)}
        >
          <option value="">All topics</option>
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
      {loading && (
        <p role="status" className="text-muted">
          Loading...
        </p>
      )}
      {!loading && questions.length === 0 && (
        <p className="rounded-md border border-dashed border-rule-strong px-4 py-6 text-center text-muted">
          {emptyMessage}
        </p>
      )}
      {questions.length > 0 && (
        <ul className="divide-y divide-rule border-y border-rule">
          {questions.map((question) =>
            editingQuestionId === question.id ? (
              <li key={question.id} className="py-4">
                <div className="rounded-lg border border-board/40 bg-board-soft/40 p-4">
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
                </div>
              </li>
            ) : (
              <li key={question.id} className="space-y-3 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <p className="min-w-0 font-semibold break-words">{question.stem}</p>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Badge>{question.topic}</Badge>
                    <Badge>{DIFFICULTY_LABELS[question.difficulty]}</Badge>
                    {question.source === 'llm' && <Badge tone="brand">AI generated</Badge>}
                    <Badge tone={question.approved ? 'success' : 'warning'}>
                      {question.approved ? 'Approved' : 'Pending'}
                    </Badge>
                  </div>
                </div>
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
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingQuestionId(question.id)}
                  >
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
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
