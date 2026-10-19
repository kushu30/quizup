import { quizCreateSchema, type QuizWithCount } from '@quizup/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Notice, PageHeader, TextField, buttonClasses } from '../components/ui';
import { api, describeError } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

const MODE_LABELS: Record<string, string> = { live: 'Live', exam: 'Exam', coding: 'Coding' };

export function Host() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizWithCount[]>([]);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
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
      setTitleError(parsed.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    setTitleError(null);
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
    <div>
      <PageHeader
        title="Your quizzes"
        description={`Signed in as ${profile?.name ?? profile?.email ?? ''}.`}
        actions={
          <Link to="/host/questions" className={buttonClasses('secondary', 'md')}>
            Question bank
          </Link>
        }
      />
      <form
        onSubmit={(event) => void handleCreate(event)}
        noValidate
        className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start"
      >
        <TextField
          label="New quiz title"
          className="flex-1"
          placeholder="For example, Fractions review"
          value={title}
          error={titleError}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type="submit" className="sm:mt-6">
          Create quiz
        </Button>
      </form>
      {message && (
        <Notice tone="danger" className="mb-6">
          {message}
        </Notice>
      )}
      {loading && (
        <p role="status" className="text-muted">
          Loading...
        </p>
      )}
      {!loading && quizzes.length === 0 && (
        <p className="rounded-lg border border-dashed border-rule-strong px-5 py-8 text-center text-muted">
          No quizzes yet. Give your first one a title above to start adding questions.
        </p>
      )}
      {quizzes.length > 0 && (
        <ul className="divide-y divide-rule rounded-lg border border-rule bg-surface">
          {quizzes.map((quiz) => (
            <li key={quiz.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <Link to={`/host/quizzes/${quiz.id}`} className="group min-w-0 flex-1 rounded-sm">
                <span className="block truncate font-semibold group-hover:underline">
                  {quiz.title}
                </span>
                <span className="mt-0.5 block text-sm text-muted">
                  {MODE_LABELS[quiz.mode] ?? quiz.mode}, {quiz.question_count}{' '}
                  {quiz.question_count === 1 ? 'question' : 'questions'}
                </span>
              </Link>
              <Button
                variant="danger"
                size="sm"
                aria-label={`Delete ${quiz.title}`}
                onClick={() => {
                  if (window.confirm(`Delete "${quiz.title}" and all its questions?`)) {
                    void handleDelete(quiz.id);
                  }
                }}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
