import { quizCreateSchema, type QuizWithCount } from '@quizup/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, describeError } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

export function Host() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizWithCount[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setQuizzes(await api.listQuizzes());
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = quizCreateSchema.safeParse({ title });
    if (!parsed.success) {
      setMessage(parsed.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    try {
      const quiz = await api.createQuiz(parsed.data);
      navigate(`/host/quizzes/${quiz.id}`);
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function handleDelete(quizId: string) {
    try {
      await api.deleteQuiz(quizId);
      await load();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Host dashboard</h1>
        <Link to="/host/questions" className="text-sm hover:underline">
          Question bank
        </Link>
      </div>
      <p className="text-slate-600">Signed in as {profile?.name ?? profile?.email}.</p>
      <form onSubmit={(event) => void handleCreate(event)} className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-slate-300 px-3 py-2"
          placeholder="New quiz title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-white">
          Create quiz
        </button>
      </form>
      {message && <p className="text-sm text-red-700">{message}</p>}
      {loading && <p className="text-slate-600">Loading...</p>}
      {!loading && quizzes.length === 0 && <p className="text-slate-500">No quizzes yet</p>}
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {quizzes.map((quiz) => (
          <li key={quiz.id} className="flex items-center justify-between px-4 py-3">
            <Link to={`/host/quizzes/${quiz.id}`} className="font-medium hover:underline">
              {quiz.title}
              <span className="ml-2 text-sm font-normal text-slate-500">
                {quiz.mode} · {quiz.question_count} questions
              </span>
            </Link>
            <button
              type="button"
              className="text-sm text-red-700 hover:underline"
              onClick={() => {
                if (window.confirm(`Delete "${quiz.title}" and all its questions?`)) {
                  void handleDelete(quiz.id);
                }
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
