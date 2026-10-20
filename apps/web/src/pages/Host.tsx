import {
  DEFAULT_QUESTION_DURATION_SECONDS,
  quizCreateSchema,
  sessionCreateSchema,
  type QuizActivity,
  type QuizWithCount,
} from '@quizup/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { QuizCard } from '../components/QuizCard';
import {
  Button,
  Notice,
  PageHeader,
  SkeletonList,
  TextField,
  buttonClasses,
} from '../components/ui';
import { api, describeError } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

export function Host() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizWithCount[]>([]);
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<Map<string, QuizActivity>>(new Map());
  const [runningQuizId, setRunningQuizId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QuizWithCount | null>(null);

  const load = useCallback(async () => {
    try {
      setQuizzes(await api.listQuizzes());
      const loadedActivity = await api.getQuizActivity().catch(() => []);
      setActivity(new Map(loadedActivity.map((entry) => [entry.quizId, entry])));
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

  async function handleRun(quizId: string) {
    setRunningQuizId(quizId);
    setMessage(null);
    try {
      const summary = await api.createSession(
        sessionCreateSchema.parse({
          quizId,
          questionDurationSeconds: DEFAULT_QUESTION_DURATION_SECONDS,
        }),
      );
      navigate(`/host/sessions/${summary.session.id}`);
    } catch (error) {
      setMessage(describeError(error));
      setRunningQuizId(null);
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
        <>
          <span role="status" className="sr-only">
            Loading...
          </span>
          <SkeletonList rows={3} />
        </>
      )}
      {!loading && quizzes.length === 0 && (
        <p className="rounded-lg border border-dashed border-rule-strong px-5 py-8 text-center text-muted">
          No quizzes yet. Give your first one a title above to start adding questions.
        </p>
      )}
      {quizzes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((quiz) => (
            <QuizCard
              key={quiz.id}
              quiz={quiz}
              activity={activity.get(quiz.id)}
              running={runningQuizId === quiz.id}
              onRun={() => void handleRun(quiz.id)}
              onDelete={() => setPendingDelete(quiz)}
            />
          ))}
        </div>
      )}
      {pendingDelete && (
        <ConfirmDialog
          title="Delete this quiz?"
          confirmLabel="Delete quiz"
          cancelLabel="Keep quiz"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            void handleDelete(target.id);
          }}
        >
          <p>
            <strong className="font-semibold text-ink">{pendingDelete.title}</strong> and all its
            questions will be removed. This cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
