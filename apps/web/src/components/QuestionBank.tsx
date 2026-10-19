import type { Difficulty, Question } from '@quizup/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, describeError } from '../lib/api';
import { QuestionForm } from './QuestionForm';

interface QuestionBankProps {
  quizId?: string;
  refreshKey?: number;
  onChanged?: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export function QuestionBank({ quizId, refreshKey = 0, onChanged }: QuestionBankProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | ''>('');
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
  }, [quizId, debouncedSearch, topicFilter, difficultyFilter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

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
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-48 flex-1 rounded-md border border-slate-300 px-3 py-2"
          placeholder="Search question or topic"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2"
          value={topicFilter}
          onChange={(event) => setTopicFilter(event.target.value)}
        >
          <option value="">All topics</option>
          {topics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2"
          value={difficultyFilter}
          onChange={(event) => setDifficultyFilter(event.target.value as Difficulty | '')}
        >
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      {message && <p className="text-sm text-red-700">{message}</p>}
      {loading && <p className="text-slate-600">Loading...</p>}
      {!loading && questions.length === 0 && <p className="text-slate-500">No questions found</p>}
      <ul className="space-y-2">
        {questions.map((question) =>
          editingQuestionId === question.id ? (
            <li key={question.id}>
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
              className="space-y-1 rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{question.stem}</p>
                <span className="shrink-0 text-xs text-slate-500">
                  {question.topic} · {question.difficulty}
                </span>
              </div>
              <ol className="text-sm text-slate-700">
                {question.options.map((option, optionIndex) => (
                  <li
                    key={OPTION_LETTERS[optionIndex]}
                    className={optionIndex === question.correct_index ? 'font-semibold' : ''}
                  >
                    {OPTION_LETTERS[optionIndex]}. {option}
                    {optionIndex === question.correct_index ? ' (correct)' : ''}
                  </li>
                ))}
              </ol>
              <div className="flex gap-3 pt-1 text-sm">
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => setEditingQuestionId(question.id)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-red-700 hover:underline"
                  onClick={() => void handleDelete(question.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
