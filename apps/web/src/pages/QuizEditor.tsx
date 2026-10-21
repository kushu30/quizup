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
  type AccessMode,
  type AssessmentType,
  type Quiz,
} from '@quizup/shared';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CsvImport } from '../components/CsvImport';
import { GenerateQuestionsPanel } from '../components/GenerateQuestionsPanel';
import { AccessModePicker } from '../components/AccessModePicker';
import { AssessmentTypePicker } from '../components/AssessmentTypePicker';
import { BrandingForm } from '../components/branding/BrandingForm';
import { QuestionBank } from '../components/QuestionBank';
import { QuestionForm } from '../components/QuestionForm';
import { AuthField, AuthNotice } from '../components/landing/AuthField';
import {
  ctaDark,
  ctaLight,
  ctaPrimary,
  ctaQuiet,
  ctaQuietDanger,
  ctaSize,
  ctaSoft,
} from '../components/landing/cta';
import { PageBody, PageHeader } from '../components/app/Page';
import { AppIcon, ICONS } from '../components/app/icons';
import { QuizTypeIcon, TYPE_LABELS } from '../components/quizMeta';
import { PageLoader } from '../components/ui';
import { api, describeError } from '../lib/api';
import { useAutoDismiss } from '../lib/useAutoDismiss';

const SAVED_MESSAGE = 'Saved';

const ACCESS_LABELS: Record<AccessMode, string> = {
  open: 'Anyone with the code',
  token: 'Invited students only',
};

type AddMethod = 'write' | 'csv' | 'ai';

// The editor walks through these one at a time; the last shows the whole quiz as a review.
type Stage = 'details' | 'branding' | 'questions' | 'review';

const STAGES: { key: Stage; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'branding', label: 'Branding' },
  { key: 'questions', label: 'Questions' },
  { key: 'review', label: 'Review' },
];

// Short labels stand in on phones, where the full ones do not fit side by side.
const ADD_METHODS: { key: AddMethod; label: string; short: string }[] = [
  { key: 'write', label: 'Write a question', short: 'Write' },
  { key: 'csv', label: 'Import CSV', short: 'Import CSV' },
  { key: 'ai', label: 'Generate with AI', short: 'With AI' },
];

export function QuizEditor() {
  const { quizId = '' } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [title, setTitle] = useState('');
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('live');
  const [accessMode, setAccessMode] = useState<AccessMode>('open');
  const [durationMinutes, setDurationMinutes] = useState(String(DEFAULT_EXAM_DURATION_MINUTES));
  const examMode = assessmentType === 'exam';
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [counts, setCounts] = useState({ approved: 0, pending: 0 });
  const [durationSeconds, setDurationSeconds] = useState(DEFAULT_QUESTION_DURATION_SECONDS);
  const [addMethod, setAddMethod] = useState<AddMethod>('write');
  const [stage, setStage] = useState<Stage | null>(null);
  const [visited, setVisited] = useState<Set<Stage>>(new Set());
  const [countsLoaded, setCountsLoaded] = useState(false);
  const messageFading = useAutoDismiss(message, () => setMessage(null));
  const secondsId = useId();

  // What is saved, so the settings can say when they have unsaved changes.
  const saved = useMemo(() => {
    const settings = quizSettingsSchema.safeParse(quiz?.settings);
    return {
      title: quiz?.title ?? '',
      type: settings.success ? assessmentTypeOf(settings.data) : ('live' as AssessmentType),
      access: settings.success ? settings.data.accessMode : ('open' as AccessMode),
      duration:
        settings.success && settings.data.durationMinutes !== undefined
          ? String(settings.data.durationMinutes)
          : String(DEFAULT_EXAM_DURATION_MINUTES),
    };
  }, [quiz]);
  const unsaved =
    quiz !== null &&
    (title !== saved.title ||
      assessmentType !== saved.type ||
      accessMode !== saved.access ||
      (assessmentType === 'exam' && durationMinutes !== saved.duration));

  const loadQuiz = useCallback(async () => {
    try {
      const loaded = await api.getQuiz(quizId);
      setQuiz(loaded);
      setTitle(loaded.title);
      const settings = quizSettingsSchema.safeParse(loaded.settings);
      setAssessmentType(settings.success ? assessmentTypeOf(settings.data) : 'live');
      setAccessMode(settings.success ? settings.data.accessMode : 'open');
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
          setCountsLoaded(true);
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

  // A quiz with questions opens on its review; a new one starts at the first step.
  useEffect(() => {
    if (stage !== null || !quiz || !countsLoaded) {
      return;
    }
    if (counts.approved + counts.pending > 0) {
      setStage('review');
      setVisited(new Set(STAGES.map((entry) => entry.key)));
    } else {
      setStage('details');
      setVisited(new Set<Stage>(['details']));
    }
  }, [stage, quiz, countsLoaded, counts]);

  function goTo(next: Stage) {
    setStage(next);
    setVisited((current) => new Set(current).add(next));
    document.documentElement.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

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
    await saveDetails();
  }

  // Saves the title and mode, and says whether it worked.
  async function saveDetails(): Promise<boolean> {
    const parsed = quizUpdateSchema.safeParse({
      title,
      mode: examMode ? 'exam' : 'live',
      settings: {
        ...(quiz?.settings ?? {}),
        adaptiveRounds: undefined,
        durationMinutes: undefined,
        ...settingsForAssessmentType(assessmentType, Number(durationMinutes)),
        accessMode,
      },
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues.map((issue) => issue.message).join('; '));
      return false;
    }
    try {
      setQuiz(await api.updateQuiz(quizId, parsed.data));
      setMessage(SAVED_MESSAGE);
      return true;
    } catch (error) {
      setMessage(describeError(error));
      return false;
    }
  }

  async function continueFromDetails() {
    if (!unsaved || (await saveDetails())) {
      goTo('branding');
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

  if (!quiz || stage === null) {
    return (
      <section className="flex flex-1 flex-col">
        <PageHeader back={{ to: '/host', label: 'Quizzes' }} title="Quiz">
          <div className="mt-6">
            {message ? (
              <AuthNotice tone="danger">{message}</AuthNotice>
            ) : (
              <PageLoader label="Loading..." />
            )}
          </div>
        </PageHeader>
        <PageBody>{null}</PageBody>
      </section>
    );
  }

  const ready = counts.approved > 0;
  const sessionLabel = examMode ? 'Exam session' : 'Live session';
  const reviewing = stage === 'review';
  const brandingName = splitStoredBranding(quiz.settings).branding?.institutionName;
  const stepMeta: Record<Stage, string> = {
    details: TYPE_LABELS[saved.type],
    branding: brandingName ?? 'Optional',
    questions: `${counts.approved} approved`,
    review: ready ? 'Ready to run' : 'Not ready yet',
  };
  const stageIndex = STAGES.findIndex((entry) => entry.key === stage);
  const previousStage = STAGES[stageIndex - 1]?.key;

  const detailsCard = (collapsible: boolean) => (
    <EditorCard
      collapsible={collapsible}
      id="details"
      title="Details and mode"
      description="How the quiz runs and who can take part."
    >
      <form onSubmit={(event) => void handleSaveDetails(event)} className="space-y-5">
        <div className="max-w-xl">
          <AuthField
            label="Quiz title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <AssessmentTypePicker
            value={assessmentType}
            onChange={setAssessmentType}
            durationMinutes={durationMinutes}
            onDurationChange={setDurationMinutes}
          />
          <AccessModePicker value={accessMode} onChange={setAccessMode} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={`${ctaDark} ${ctaSize.md}`}>
            Save details
          </button>
          {unsaved && (
            <span className="inline-flex items-center gap-2 text-sm text-night/55">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}
        </div>
      </form>
    </EditorCard>
  );

  const brandingCard = (collapsible: boolean, defaultOpen = true) => (
    <EditorCard
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      id="branding"
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
    </EditorCard>
  );

  const addCard = (collapsible: boolean, defaultOpen = true) => (
    <EditorCard
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      id="add-questions"
      title="Add questions"
    >
      <div
        role="tablist"
        aria-label="How to add questions"
        className="flex w-full overflow-x-auto rounded-[0.9rem] bg-night/[0.05] p-1 sm:inline-flex sm:w-auto"
      >
        {ADD_METHODS.map((method) => (
          <button
            key={method.key}
            type="button"
            role="tab"
            aria-selected={addMethod === method.key}
            aria-label={method.label}
            onClick={() => setAddMethod(method.key)}
            className={`h-9 flex-1 rounded-[0.7rem] px-3 text-sm font-medium whitespace-nowrap transition-[background-color,box-shadow,color] duration-200 ease-soft sm:flex-none sm:px-3.5 ${
              addMethod === method.key
                ? 'bg-white text-night shadow-[0_0_0_1px_rgba(17,16,20,0.06),0_1px_2px_rgba(17,16,20,0.1)]'
                : 'text-night/55 hover:text-night'
            }`}
          >
            <span className="sm:hidden">{method.short}</span>
            <span className="hidden sm:inline">{method.label}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-5">
        {addMethod === 'write' && (
          <QuestionForm
            submitLabel="Add question"
            onSubmit={async (input) => {
              await api.createQuestion(quizId, input);
              refreshQuestions();
            }}
          />
        )}
        {addMethod === 'csv' && <CsvImport quizId={quizId} onImported={refreshQuestions} />}
        {addMethod === 'ai' && (
          <GenerateQuestionsPanel quizId={quizId} onGenerated={refreshQuestions} />
        )}
      </div>
    </EditorCard>
  );

  // The questions share one square-edged area: what is waiting and what is approved side by
  // side, and the form for adding more across the full width below.
  const questionsArea = () => (
    <div className="@container space-y-3 border border-dashed border-night/20 bg-canvas p-3 sm:space-y-4 sm:p-4">
      <div className="grid gap-3 sm:gap-4 @2xl:grid-cols-2">
        {needsReviewCard(false, true)}
        {approvedCard(false, true)}
      </div>
      {addCard(false)}
    </div>
  );

  const needsReviewCard = (collapsible: boolean, paired = false) => (
    <EditorCard
      paired={paired}
      collapsible={collapsible}
      id="needs-review"
      title="Needs review"
      count={counts.pending}
      description="Questions drafted with AI wait here until you approve them."
      actions={
        <button
          type="button"
          disabled={counts.pending === 0}
          onClick={() => void handleApproveAll()}
          className={`${ctaSoft} ${ctaSize.sm}`}
        >
          Approve all
        </button>
      }
    >
      <QuestionBank
        compact
        quizId={quizId}
        lockedApproval="pending"
        emptyMessage="Nothing waiting for review"
        refreshKey={refreshKey}
        onChanged={refreshQuestions}
      />
    </EditorCard>
  );

  const approvedCard = (collapsible: boolean, paired = false) => (
    <EditorCard
      paired={paired}
      collapsible={collapsible}
      id="approved"
      title="Approved questions"
      count={counts.approved}
    >
      <QuestionBank
        compact
        quizId={quizId}
        lockedApproval="approved"
        emptyMessage="No approved questions yet"
        refreshKey={refreshKey}
        onChanged={refreshQuestions}
      />
    </EditorCard>
  );

  return (
    <section className="flex flex-1 flex-col">
      <PageHeader
        back={{ to: '/host', label: 'Quizzes' }}
        title={quiz.title}
        description={
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <QuizTypeIcon type={saved.type} />
            <span>{TYPE_LABELS[saved.type]}</span>
            <span aria-hidden="true">·</span>
            <span>{ACCESS_LABELS[saved.access]}</span>
            <span aria-hidden="true">·</span>
            <span>
              {counts.approved + counts.pending}{' '}
              {counts.approved + counts.pending === 1 ? 'question' : 'questions'}
            </span>
          </p>
        }
        actions={
          <div className="-ml-3 flex flex-wrap items-center gap-1 lg:ml-0">
            <Link to={`/host/quizzes/${quiz.id}/history`} className={`${ctaQuiet} ${ctaSize.sm}`}>
              History
            </Link>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className={`${ctaQuietDanger} ${ctaSize.sm}`}
            >
              Delete quiz
            </button>
          </div>
        }
      >
        {message && (
          <AuthNotice
            tone={message === SAVED_MESSAGE ? 'info' : 'danger'}
            className="mt-6"
            fading={messageFading}
            onDismiss={() => setMessage(null)}
          >
            {message}
          </AuthNotice>
        )}
      </PageHeader>
      <PageBody>
        <div className="grid flex-1 items-start gap-x-10 px-4 pt-8 lg:grid-cols-[15rem_minmax(0,1fr)] sm:px-10">
          <div className="contents lg:sticky lg:top-6 lg:block lg:space-y-5">
            <div className="order-1">
              <Stepper
                steps={STAGES.map((entry) => ({
                  ...entry,
                  meta: stepMeta[entry.key],
                  dot: entry.key === 'details' && unsaved,
                }))}
                current={stage}
                visited={visited}
                onSelect={goTo}
              />
            </div>
            <SessionCard title={sessionLabel}>
              <p className="text-sm text-white/65">
                {ready ? (
                  <>
                    <span className="font-medium text-white">{counts.approved} approved</span>
                    {counts.pending > 0 && <>, {counts.pending} waiting for review</>}
                  </>
                ) : (
                  <span className="text-amber-200">
                    Approve at least one question to start a session.
                  </span>
                )}
              </p>
              {!examMode && (
                <div className="space-y-1.5">
                  <label htmlFor={secondsId} className="block text-sm text-white/55">
                    Seconds per question
                  </label>
                  <input
                    id={secondsId}
                    type="number"
                    min={MIN_QUESTION_DURATION_SECONDS}
                    max={MAX_QUESTION_DURATION_SECONDS}
                    value={durationSeconds}
                    onChange={(event) => setDurationSeconds(Number(event.target.value))}
                    className="h-10 w-full rounded-[0.7rem] bg-white/10 px-3 font-geist-mono text-sm text-white tabular-nums shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)] transition-shadow duration-200 ease-soft focus:shadow-[inset_0_0_0_2px_var(--color-accent-400)] focus:outline-none"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleStartLiveSession()}
                disabled={!ready}
                className={`${ctaPrimary} ${ctaSize.md} w-full`}
              >
                {examMode ? 'Open exam session' : 'Start live session'}
              </button>
            </SessionCard>
          </div>

          <div key={stage} className="order-2 mt-6 min-w-0 animate-fade-in space-y-5 lg:mt-0">
            {stage === 'details' && detailsCard(false)}
            {stage === 'branding' && brandingCard(false)}
            {stage === 'questions' && questionsArea()}
            {reviewing && (
              <>
                {detailsCard(true)}
                {needsReviewCard(true)}
                {approvedCard(true)}
                {brandingCard(true, false)}
                {addCard(true, false)}
              </>
            )}

            {!reviewing && (
              <div className="flex items-center justify-between gap-3 pt-1 pb-2">
                {previousStage ? (
                  <button
                    type="button"
                    onClick={() => goTo(previousStage)}
                    className={`${ctaLight} ${ctaSize.md}`}
                  >
                    Back
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() =>
                    stage === 'details'
                      ? void continueFromDetails()
                      : goTo(stage === 'branding' ? 'questions' : 'review')
                  }
                  className={`${ctaDark} ${ctaSize.md}`}
                >
                  {stage === 'branding'
                    ? brandingName
                      ? 'Continue'
                      : 'Skip for now'
                    : stage === 'questions'
                      ? 'Review quiz'
                      : 'Continue'}
                </button>
              </div>
            )}
          </div>
        </div>
      </PageBody>
      {confirmingDelete && (
        <ConfirmDialog
          modern
          title="Delete this quiz?"
          confirmLabel="Delete quiz"
          cancelLabel="Keep quiz"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            void handleDeleteQuiz();
          }}
        >
          <p>
            <strong className="font-medium text-night">{quiz?.title}</strong> and all its questions
            will be removed. This cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

// The steps of the editor, in order, with where the host is. Any step can be opened at any
// time; the line just shows the way through.
function Stepper({
  steps,
  current,
  visited,
  onSelect,
}: {
  steps: { key: Stage; label: string; meta: string; dot?: boolean }[];
  current: Stage;
  visited: Set<Stage>;
  onSelect: (stage: Stage) => void;
}) {
  return (
    <nav aria-label="Editor steps">
      <ol className="flex gap-1 overflow-x-auto lg:block lg:overflow-visible">
        {steps.map((step, index) => {
          const active = step.key === current;
          const done = !active && visited.has(step.key);
          return (
            <li key={step.key} className="relative min-w-0 shrink-0 lg:shrink">
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-[2.4rem] bottom-0 left-[1.3125rem] hidden border-l border-dashed border-night/20 lg:block"
                />
              )}
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(step.key)}
                className={`flex w-full items-center gap-3 rounded-[0.8rem] px-2.5 py-2 text-left transition-colors duration-200 ease-soft lg:items-start lg:py-2.5 ${
                  active ? 'bg-night/[0.06]' : 'hover:bg-night/[0.03]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-soft lg:mt-px ${
                    active
                      ? 'bg-night'
                      : done
                        ? 'bg-accent-500 text-white'
                        : 'border border-dashed border-night/30 bg-white'
                  }`}
                >
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  {done && <AppIcon size={12}>{ICONS.check}</AppIcon>}
                </span>
                <span className="min-w-0">
                  <span
                    className={`flex items-center gap-2 text-sm whitespace-nowrap ${
                      active ? 'font-medium text-night' : 'text-night/70'
                    }`}
                  >
                    {step.label}
                    {step.dot && (
                      <span
                        role="img"
                        aria-label="Unsaved changes"
                        className="h-1.5 w-1.5 rounded-full bg-amber-500"
                      />
                    )}
                  </span>
                  <span className="mt-0.5 hidden max-w-[10.5rem] truncate text-xs text-night/45 lg:block">
                    {step.meta}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// A card for one part of the editor, named by its heading so it reads as a region. In the
// review the cards fold away, so a long quiz can be looked over a part at a time.
function EditorCard({
  id,
  title,
  count,
  description,
  actions,
  collapsible = false,
  defaultOpen = true,
  paired = false,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  description?: string;
  actions?: ReactNode;
  collapsible?: boolean;
  // Whether a collapsible card starts unfolded.
  defaultOpen?: boolean;
  // Sits beside another card in a grid and shares its rows, so both come out the same height.
  paired?: boolean;
  children: ReactNode;
}) {
  const headingId = useId();
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen);
  // The body is clipped while it opens or closes, but not once it is open, so menus and focus
  // rings are never cut off.
  const [clip, setClip] = useState(false);
  const countBadge = count !== undefined && (
    <span className="ml-1 font-geist-mono text-sm font-normal text-night/40 tabular-nums">
      {count}
    </span>
  );
  const folded = collapsible && !open;

  function toggle() {
    setClip(true);
    setOpen((current) => !current);
  }

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      // A folded card opens from anywhere on its bar, not only from the heading.
      onClick={(event) => {
        if (folded && !(event.target as HTMLElement).closest('button, a, input')) {
          toggle();
        }
      }}
      className={`scroll-mt-6 rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_1px_3px_rgba(17,16,20,0.05)] transition-shadow duration-200 ease-soft sm:p-5 ${
        paired ? 'row-span-2 grid grid-rows-subgrid gap-y-4' : ''
      } ${folded ? 'cursor-pointer hover:shadow-[0_0_0_1px_rgba(17,16,20,0.16),0_1px_3px_rgba(17,16,20,0.05)]' : ''}`}
    >
      <div
        className={`flex items-start gap-3 transition-[margin] duration-300 ease-soft ${
          folded || paired ? '' : 'mb-4'
        }`}
      >
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-lg font-medium tracking-tight">
            {collapsible ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={toggle}
                className="group -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-lg px-1.5 py-0.5 text-left transition-colors duration-200 ease-soft hover:bg-night/[0.03]"
              >
                <span>{title}</span>
                {countBadge}
                <AppIcon
                  size={16}
                  className={`ml-auto text-night/40 transition-transform duration-300 ease-soft group-hover:text-night ${
                    open ? '' : '-rotate-90'
                  }`}
                >
                  {ICONS.chevronDown}
                </AppIcon>
              </button>
            ) : (
              <>
                {title} {countBadge}
              </>
            )}
          </h2>
          {description && !folded && (
            <p className="mt-1 text-sm leading-relaxed text-night/55">{description}</p>
          )}
        </div>
        {!folded && actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div
        id={bodyId}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'grid-template-rows' && open) {
            setClip(false);
          }
        }}
        className={`grid transition-[grid-template-rows,visibility] duration-300 ease-soft ${
          folded ? 'invisible grid-rows-[0fr]' : 'grid-rows-[1fr]'
        }`}
      >
        <div className={`min-h-0 ${clip || folded ? 'overflow-hidden' : ''}`}>{children}</div>
      </div>
    </section>
  );
}

// Starting the session, kept beside the editor while the host works.
function SessionCard({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="order-3 mt-6 space-y-4 rounded-2xl bg-night p-5 text-white lg:order-none lg:mt-0 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_12px_32px_-18px_rgba(17,16,20,0.6)]"
    >
      <h2 id={headingId} className="text-[0.9375rem] font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}
