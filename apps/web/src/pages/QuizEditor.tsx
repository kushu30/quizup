import {
  DEFAULT_QUESTION_DURATION_SECONDS,
  MAX_QUESTION_DURATION_SECONDS,
  MIN_QUESTION_DURATION_SECONDS,
  DEFAULT_EXAM_DURATION_MINUTES,
  assessmentTypeOf,
  quizSettingsSchema,
  quizUpdateSchema,
  sessionCreateSchema,
  settingsForAssessmentType,
  splitStoredBranding,
  type Branding,
  type AssessmentType,
  type Quiz,
} from '@quizup/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CsvImport } from '../components/CsvImport';
import { GenerateQuestionsPanel } from '../components/GenerateQuestionsPanel';
import { AssessmentTypePicker } from '../components/AssessmentTypePicker';
import { BrandingForm } from '../components/branding/BrandingForm';
import { QuestionBank } from '../components/QuestionBank';
import { QuestionForm } from '../components/QuestionForm';
import { Button, Notice, PageHeader, Panel, TextField, buttonClasses } from '../components/ui';
import { api, describeError } from '../lib/api';

const SAVED_MESSAGE = 'Saved';

export function QuizEditor() {
  const { quizId = '' } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [title, setTitle] = useState('');
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('live');
  const [durationMinutes, setDurationMinutes] = useState(String(DEFAULT_EXAM_DURATION_MINUTES));
  const examMode = assessmentType === 'exam';
  const [message, setMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [counts, setCounts] = useState({ approved: 0, pending: 0 });
  const [durationSeconds, setDurationSeconds] = useState(DEFAULT_QUESTION_DURATION_SECONDS);

  const loadQuiz = useCallback(async () => {
    try {
      const loaded = await api.getQuiz(quizId);
      setQuiz(loaded);
      setTitle(loaded.title);
      const settings = quizSettingsSchema.safeParse(loaded.settings);
      setAssessmentType(settings.success ? assessmentTypeOf(settings.data) : 'live');
      setDurationMinutes(
        settings.success && settings.data.durationMinutes !== undefined
          ? String(settings.data.durationMinutes)
          : String(DEFAULT_EXAM_DURATION_MINUTES),
      );
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
    const parsed = quizUpdateSchema.safeParse({
      title,
      mode: examMode ? 'exam' : 'live',
      settings: {
        ...(quiz?.settings ?? {}),
        adaptiveRounds: undefined,
        durationMinutes: undefined,
        ...settingsForAssessmentType(assessmentType, Number(durationMinutes)),
      },
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    try {
      setQuiz(await api.updateQuiz(quizId, parsed.data));
      setMessage(SAVED_MESSAGE);
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  async function handleSaveBranding(branding: Branding) {
    const parsed = quizUpdateSchema.parse({
      settings: { ...(quiz?.settings ?? {}), branding },
    });
    setQuiz(await api.updateQuiz(quizId, parsed));
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
      <div>
        <PageHeader title="Quiz" back={{ to: '/host', label: 'Back to dashboard' }} />
        {message ? (
          <Notice tone="danger">{message}</Notice>
        ) : (
          <p role="status" className="text-muted">
            Loading...
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={quiz.title}
        back={{ to: '/host', label: 'Back to dashboard' }}
        actions={
          <>
            <Link
              to={`/host/quizzes/${quiz.id}/history`}
              className={buttonClasses('secondary', 'md')}
            >
              History
            </Link>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(`Delete "${quiz.title}" and all its questions?`)) {
                  void handleDeleteQuiz();
                }
              }}
            >
              Delete quiz
            </Button>
          </>
        }
      />
      {message && (
        <Notice tone={message === SAVED_MESSAGE ? 'success' : 'danger'} className="mb-6">
          {message}
        </Notice>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-6 lg:sticky lg:top-6">
          <Panel title="Details and mode">
            <form onSubmit={(event) => void handleSaveDetails(event)} className="space-y-4">
              <TextField
                label="Quiz title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <AssessmentTypePicker
                value={assessmentType}
                onChange={setAssessmentType}
                durationMinutes={durationMinutes}
                onDurationChange={setDurationMinutes}
              />
              <Button type="submit" className="w-full">
                Save details
              </Button>
            </form>
          </Panel>

          <Panel title={examMode ? 'Exam session' : 'Live session'}>
            <div className="space-y-4">
              {!examMode && (
                <TextField
                  label="Seconds per question"
                  type="number"
                  min={MIN_QUESTION_DURATION_SECONDS}
                  max={MAX_QUESTION_DURATION_SECONDS}
                  inputClassName="w-28"
                  value={durationSeconds}
                  onChange={(event) => setDurationSeconds(Number(event.target.value))}
                />
              )}
              <p className="text-sm text-muted">
                <span className="font-semibold text-ink">{counts.approved}</span> approved,{' '}
                <span className="font-semibold text-ink">{counts.pending}</span> pending review
              </p>
              {counts.approved === 0 && (
                <p className="text-sm text-marker-ink">
                  Approve at least one question to start a session.
                </p>
              )}
              <Button
                variant="brand"
                size="lg"
                className="w-full"
                onClick={() => void handleStartLiveSession()}
                disabled={counts.approved === 0}
              >
                {examMode ? 'Open exam session' : 'Start live session'}
              </Button>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel
            title="Branding"
            description="Your institution's look on every student screen, powered by QuizUp."
          >
            <BrandingForm
              key={quiz.id}
              initial={splitStoredBranding(quiz.settings).branding ?? {}}
              hostId={quiz.host_id}
              quizId={quiz.id}
              quizTitle={quiz.title}
              onSave={handleSaveBranding}
            />
          </Panel>

          <Panel title="Add questions">
            <div className="divide-y divide-rule">
              <section aria-labelledby="write-question-heading" className="space-y-3 pb-6">
                <h3 id="write-question-heading" className="text-base font-semibold">
                  Write a question
                </h3>
                <QuestionForm
                  submitLabel="Add question"
                  onSubmit={async (input) => {
                    await api.createQuestion(quizId, input);
                    refreshQuestions();
                  }}
                />
              </section>
              <div className="py-6">
                <CsvImport quizId={quizId} onImported={refreshQuestions} />
              </div>
              <div className="pt-6">
                <GenerateQuestionsPanel quizId={quizId} onGenerated={refreshQuestions} />
              </div>
            </div>
          </Panel>

          <Panel
            title={`Needs review (${counts.pending})`}
            description="Imported and AI drafted questions wait here until you approve them."
            actions={
              <Button
                variant="brand"
                size="sm"
                disabled={counts.pending === 0}
                onClick={() => void handleApproveAll()}
              >
                Approve all
              </Button>
            }
          >
            <QuestionBank
              quizId={quizId}
              lockedApproval="pending"
              emptyMessage="Nothing waiting for review"
              refreshKey={refreshKey}
              onChanged={refreshQuestions}
            />
          </Panel>

          <Panel title={`Approved questions (${counts.approved})`}>
            <QuestionBank
              quizId={quizId}
              lockedApproval="approved"
              emptyMessage="No approved questions yet"
              refreshKey={refreshKey}
              onChanged={refreshQuestions}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
