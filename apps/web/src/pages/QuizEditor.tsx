import {
  DEFAULT_QUESTION_DURATION_SECONDS,
  MAX_QUESTION_DURATION_SECONDS,
  MIN_QUESTION_DURATION_SECONDS,
  quizUpdateSchema,
  sessionCreateSchema,
  type Quiz,
  type QuizMode,
} from '@quizup/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CsvImport } from '../components/CsvImport';
import { GenerateQuestionsPanel } from '../components/GenerateQuestionsPanel';
import { QuestionBank } from '../components/QuestionBank';
import { QuestionForm } from '../components/QuestionForm';
import { api, describeError } from '../lib/api';

export function QuizEditor() {
  const { quizId = '' } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<QuizMode>('live');
  const [message, setMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [counts, setCounts] = useState({ approved: 0, pending: 0 });
  const [durationSeconds, setDurationSeconds] = useState(DEFAULT_QUESTION_DURATION_SECONDS);

  const loadQuiz = useCallback(async () => {
    try {
      const loaded = await api.getQuiz(quizId);
      setQuiz(loaded);
      setTitle(loaded.title);
      setMode(loaded.mode);
    } catch (error) {
      setMessage(describeError(error));
    }
  }, [quizId]);

  useEffect(() => {
    void loadQuiz();
  }, [loadQuiz]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.listQuestions({ quizId, approval: 'approved', limit: 500 }),
      api.listQuestions({ quizId, approval: 'pending', limit: 500 }),
    ])
      .then(([approved, pending]) => {
        if (!cancelled) {
          setCounts({ approved: approved.length, pending: pending.length });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(describeError(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [quizId, refreshKey]);

  async function handleApproveAll() {
    try {
      const pending = await api.listQuestions({ quizId, approval: 'pending', limit: 500 });
      if (pending.length > 0) {
        await api.approveQuestions(
          quizId,
          pending.map((question) => question.id),
        );
      }
      refreshQuestions();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function handleSaveDetails(event: FormEvent) {
    event.preventDefault();
    const parsed = quizUpdateSchema.safeParse({ title, mode });
    if (!parsed.success) {
      setMessage(parsed.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    try {
      setQuiz(await api.updateQuiz(quizId, parsed.data));
      setMessage('Saved');
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function handleDeleteQuiz() {
    try {
      await api.deleteQuiz(quizId);
      navigate('/host');
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function handleStartLiveSession() {
    const parsed = sessionCreateSchema.safeParse({
      quizId,
      questionDurationSeconds: durationSeconds,
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    try {
      const summary = await api.createSession(parsed.data);
      navigate(`/host/sessions/${summary.session.id}`);
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  function refreshQuestions() {
    setRefreshKey((current) => current + 1);
  }

  if (!quiz) {
    return (
      <div className="space-y-2">
        <Link to="/host" className="text-sm hover:underline">
          Back to dashboard
        </Link>
        <p className="text-slate-600">{message ?? 'Loading...'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link to="/host" className="text-sm hover:underline">
          Back to dashboard
        </Link>
        <form onSubmit={(event) => void handleSaveDetails(event)} className="flex flex-wrap gap-2">
          <input
            className="min-w-48 flex-1 rounded-md border border-slate-300 px-3 py-2 text-lg font-semibold"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            value={mode}
            onChange={(event) => setMode(event.target.value as QuizMode)}
          >
            <option value="live">Live</option>
            <option value="exam">Exam</option>
            <option value="coding">Coding</option>
          </select>
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-white">
            Save
          </button>
          <button
            type="button"
            className="rounded-md border border-red-300 px-4 py-2 text-red-700"
            onClick={() => {
              if (window.confirm(`Delete "${quiz.title}" and all its questions?`)) {
                void handleDeleteQuiz();
              }
            }}
          >
            Delete quiz
          </button>
        </form>
        {message && <p className="text-sm text-slate-700">{message}</p>}
      </div>

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          Seconds per question
          <input
            type="number"
            min={MIN_QUESTION_DURATION_SECONDS}
            max={MAX_QUESTION_DURATION_SECONDS}
            className="mt-1 block w-28 rounded-md border border-slate-300 px-3 py-2"
            value={durationSeconds}
            onChange={(event) => setDurationSeconds(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleStartLiveSession()}
          disabled={counts.approved === 0}
          className="rounded-md bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Start live session
        </button>
        <p className="w-full text-sm text-slate-600">
          {counts.approved} approved · {counts.pending} pending review
          {counts.approved === 0 && ' · approve at least one question to start a live session'}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Add a question</h2>
        <QuestionForm
          submitLabel="Add question"
          onSubmit={async (input) => {
            await api.createQuestion(quizId, input);
            refreshQuestions();
          }}
        />
        <CsvImport quizId={quizId} onImported={refreshQuestions} />
        <GenerateQuestionsPanel quizId={quizId} onGenerated={refreshQuestions} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Needs review ({counts.pending})</h2>
          <button
            type="button"
            disabled={counts.pending === 0}
            onClick={() => void handleApproveAll()}
            className="rounded-md bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
          >
            Approve all
          </button>
        </div>
        <QuestionBank
          quizId={quizId}
          lockedApproval="pending"
          emptyMessage="Nothing waiting for review"
          refreshKey={refreshKey}
          onChanged={refreshQuestions}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Approved questions ({counts.approved})</h2>
        <QuestionBank
          quizId={quizId}
          lockedApproval="approved"
          emptyMessage="No approved questions yet"
          refreshKey={refreshKey}
          onChanged={refreshQuestions}
        />
      </section>
    </div>
  );
}
