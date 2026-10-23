import type {
  Branding,
  ClientHints,
  ExamStudentView,
  ExamSubmitReason,
  JoinInfo,
  LeaderboardEntry,
  QuestionResultPayload,
  QuestionShowPayload,
  RoomStatePayload,
  SessionStatus,
  SocketErrorCode,
} from '@quizup/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ExamPlay } from '../components/exam/ExamPlay';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { Leaderboard } from '../components/Leaderboard';
import { QuestionTimer } from '../components/QuestionTimer';
import { FeedbackForm } from '../components/FeedbackForm';
import { StudentIntro } from '../components/StudentIntro';
import { QuestionImage } from '../components/QuestionImage';
import { AppIcon, ICONS } from '../components/app/icons';
import { ctaPrimary, ctaSize } from '../components/landing/cta';
import { Texture } from '../components/landing/Texture';
import { CARD, PlayStage, PlayerBar, WaitingDots } from '../components/play/PlayStage';
import { MediaProctorLayer } from '../components/proctor/MediaProctorLayer';
import { ProctorPrecheck } from '../components/proctor/ProctorPrecheck';
import { Notice, PageLoader } from '../components/ui';
import { useProctor } from '../hooks/useProctor';
import { useClockSync } from '../hooks/useClockSync';
import { useServerNow } from '../hooks/useServerNow';
import { createQuizSocket, type QuizSocket } from '../lib/socket';
import { supabase } from '../lib/supabase';
import { usePageBrand } from '../lib/brandContext';
import { markIntroDone, readIntroDone, shouldShowIntro } from '../lib/introGate';
import { markPrecheckDone, readPrecheckDone, shouldShowPrecheck } from '../lib/precheckGate';
import { clearStoredJoin, readStoredJoin, writeStoredJoin } from '../lib/storedJoin';

interface PlayState {
  connected: boolean;
  replaced: boolean;
  needsName: boolean;
  joinError: SocketErrorCode | null;
  participantId: string | null;
  displayName: string;
  status: SessionStatus;
  question: QuestionShowPayload | null;
  questionClosed: boolean;
  answered: boolean;
  chosenIndex: number | null;
  result: QuestionResultPayload | null;
  leaderboard: LeaderboardEntry[];
  standing: { rank: number; score: number } | null;
  mode: 'live' | 'exam';
  exam: ExamStudentView | null;
  adaptive: boolean;
  proctored: boolean;
  proctorCamera: boolean;
  proctorMic: boolean;
  proctorFlagLimit: number | null;
  examSubmitReason: ExamSubmitReason | null;
  quizTitle: string;
  branding: Branding | null;
}

const INITIAL_STATE: PlayState = {
  connected: false,
  replaced: false,
  needsName: false,
  joinError: null,
  participantId: null,
  displayName: '',
  status: 'lobby',
  question: null,
  questionClosed: false,
  answered: false,
  chosenIndex: null,
  result: null,
  leaderboard: [],
  standing: null,
  mode: 'live',
  exam: null,
  adaptive: false,
  proctored: false,
  proctorCamera: false,
  proctorMic: false,
  proctorFlagLimit: null,
  examSubmitReason: null,
  quizTitle: '',
  branding: null,
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

const JOIN_ERROR_MESSAGES: Record<SocketErrorCode, string> = {
  invalid_payload: 'That name or code is not valid.',
  rate_limited: 'Too many attempts, wait a moment and try again.',
  server_error: 'Something went wrong on the server.',
  unauthorized: 'Not allowed.',
  forbidden: 'Not allowed.',
  session_not_found: 'No live quiz found for this code.',
  session_ended: 'This quiz has already ended.',
  session_started: 'This quiz has already started, so new players cannot join.',
  name_invalid: 'That name is not valid.',
  name_taken:
    'That name is already in this quiz. If it is yours, ask your host to let you back in, then join again with the same name.',
  invalid_rejoin_token:
    'Your seat could not be restored on this device. Ask your host to let you back in, then join again with the same name.',
  not_in_room: 'You are not in this quiz.',
  no_active_question: 'No question is active.',
  wrong_question: 'That question is no longer active.',
  too_early: 'Too early.',
  too_late: 'Too late.',
  already_answered: 'Already answered.',
  consent_required: 'You need to accept the exam terms first.',
  consent_version_mismatch: 'The exam terms changed. Reload the page and try again.',
  exam_not_open: 'The host has not opened the exam yet.',
  not_exam: 'This is not an exam session.',
  no_open_attempt: 'You have no open exam attempt.',
  attempt_expired: 'Your time is up.',
  not_submitted: 'Submit your exam first.',
  feedback_not_open: 'Feedback opens when the quiz ends.',
  invalid_access_token:
    'That access token is not valid. Check it with your host, who can issue a new one.',
  access_token_required: 'This quiz is for invited students. Enter your access token.',
};

function readClientHints(): { client?: ClientHints } {
  const { width, height } = window.screen;
  if (!(width > 0) || !(height > 0)) {
    return {};
  }
  return {
    client: {
      screenWidth: Math.round(width),
      screenHeight: Math.round(height),
      touch: navigator.maxTouchPoints > 0,
    },
  };
}

function LiveProctor({
  socket,
  active,
  connected,
}: {
  socket: QuizSocket;
  active: boolean;
  connected: boolean;
}) {
  useProctor({
    enabled: active,
    requireFullscreen: false,
    connected,
    send: (event) => socket.emit('proctor:event', event, () => undefined),
  });
  return (
    <Notice tone="warning">
      This session is proctored. Switching tabs, copying and similar actions are recorded for your
      host.
    </Notice>
  );
}

const RETRY_JOIN_AFTER_MS = 2000;
const RETRYABLE_JOIN_ERRORS: SocketErrorCode[] = ['rate_limited', 'server_error'];

export function Play() {
  const { code = '' } = useParams();
  const joinCode = code.toUpperCase();
  const location = useLocation();
  const routeState = location.state as {
    displayName?: string;
    accessToken?: string;
    joinInfo?: JoinInfo;
  } | null;
  const stateDisplayName = routeState?.displayName;
  const stateAccessToken = routeState?.accessToken;
  const joinedOnce = useRef(false);

  const [socket, setSocket] = useState<QuizSocket | null>(null);
  const [state, setState] = useState<PlayState>(INITIAL_STATE);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const { offsetMs, synced } = useClockSync(socket);
  const [introDone, setIntroDone] = useState(() => readIntroDone(joinCode));
  const [precheckDone, setPrecheckDone] = useState(() => readPrecheckDone(joinCode));
  usePageBrand(
    state.branding ?? routeState?.joinInfo?.branding ?? null,
    shouldShowIntro({
      introDone,
      mode: state.mode,
      status: state.status,
      examPhase: state.exam?.phase ?? null,
    }),
  );
  const serverNowMs = useServerNow(offsetMs);

  useEffect(() => {
    let cancelled = false;
    let stopSocket: (() => void) | undefined;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        stopSocket = startSocket(data.session?.access_token);
      }
    });
    return () => {
      cancelled = true;
      stopSocket?.();
    };

    function startSocket(accessToken: string | undefined) {
      const quizSocket = createQuizSocket(accessToken);
      setSocket(quizSocket);

      let retryTimer: ReturnType<typeof setTimeout> | undefined;

      function joinRoom() {
        const stored = readStoredJoin(joinCode);
        const accessToken = stateAccessToken ?? stored?.accessToken;
        const displayName = stored?.displayName ?? stateDisplayName;
        if (!accessToken && !displayName) {
          setState((current) => ({
            ...current,
            connected: true,
            needsName: true,
            joinError: 'invalid_payload',
          }));
          return;
        }
        const client = readClientHints();
        const payload = accessToken
          ? { joinCode, accessToken, ...client }
          : { joinCode, displayName, rejoinToken: stored?.rejoinToken, ...client };
        quizSocket.emit('room:join', payload, (ack) => {
          if (!ack.ok) {
            if (joinedOnce.current && RETRYABLE_JOIN_ERRORS.includes(ack.error)) {
              retryTimer = setTimeout(joinRoom, RETRY_JOIN_AFTER_MS);
              return;
            }
            if (
              ack.error === 'invalid_rejoin_token' ||
              ack.error === 'invalid_access_token' ||
              ack.error === 'session_not_found'
            ) {
              clearStoredJoin(joinCode);
            }
            setState((current) => ({ ...current, connected: true, joinError: ack.error }));
            return;
          }
          if (ack.role === 'student') {
            joinedOnce.current = true;
            writeStoredJoin(joinCode, {
              participantId: ack.participantId,
              rejoinToken: ack.rejoinToken,
              displayName: ack.displayName,
              ...(accessToken ? { accessToken } : {}),
            });
            setState((current) => ({
              ...current,
              connected: true,
              replaced: false,
              joinError: null,
              participantId: ack.participantId,
              displayName: ack.displayName,
            }));
          }
        });
      }

      function applyRoomState(room: RoomStatePayload) {
        setState((current) => ({
          ...current,
          status: room.status,
          question: room.currentQuestion,
          questionClosed: room.questionClosed,
          answered: room.youAnswered,
          chosenIndex: room.youAnswered ? current.chosenIndex : null,
          result: room.lastResult,
          leaderboard: room.leaderboard,
          standing: room.you ? { rank: room.you.rank, score: room.you.score } : null,
          mode: room.mode,
          exam: room.exam,
          adaptive: room.adaptive,
          proctored: room.proctored,
          proctorCamera: room.proctorCamera,
          proctorMic: room.proctorMic,
          proctorFlagLimit: room.proctorFlagLimit,
          quizTitle: room.quizTitle,
          branding: room.branding,
        }));
      }

      quizSocket.on('connect', joinRoom);
      quizSocket.on('disconnect', (reason) =>
        setState((current) => ({
          ...current,
          connected: false,
          replaced: reason === 'io server disconnect',
        })),
      );
      quizSocket.on('room:state', applyRoomState);
      quizSocket.on('exam:released', () => {
        setState((current) =>
          current.exam ? { ...current, exam: { ...current.exam, resultsReleased: true } } : current,
        );
      });
      quizSocket.on('exam:submitted', ({ reason }) => {
        setState((current) =>
          current.exam
            ? {
                ...current,
                examSubmitReason: reason,
                exam: {
                  ...current.exam,
                  phase: 'submitted',
                  questions: [],
                  answers: {},
                  attempt: current.exam.attempt
                    ? {
                        ...current.exam.attempt,
                        submittedAtServerMs: current.exam.attempt.deadlineAtServerMs,
                      }
                    : null,
                },
              }
            : current,
        );
      });
      quizSocket.on('question:show', (question) => {
        setAnswerError(null);
        setState((current) => ({
          ...current,
          status: 'running',
          question,
          questionClosed: false,
          answered: false,
          chosenIndex: null,
          result: null,
        }));
      });
      quizSocket.on('question:result', (result) => {
        setState((current) => ({
          ...current,
          questionClosed: true,
          result,
          standing: result.you
            ? { rank: result.you.rank, score: result.you.totalPoints }
            : current.standing,
        }));
      });
      quizSocket.on('leaderboard:update', (update) => {
        setState((current) => ({
          ...current,
          leaderboard: update.entries,
          standing: update.you ?? current.standing,
        }));
      });
      quizSocket.on('session:end', (ended) => {
        setState((current) => ({
          ...current,
          status: 'ended',
          leaderboard: ended.entries,
          standing: ended.you ?? current.standing,
        }));
      });

      return () => {
        clearTimeout(retryTimer);
        quizSocket.disconnect();
        setSocket(null);
      };
    }
  }, [joinCode, stateDisplayName, stateAccessToken]);

  function submitAnswer(chosenIndex: number) {
    if (!socket || !state.question || state.answered) {
      return;
    }
    setAnswerError(null);
    setState((current) => ({ ...current, answered: true, chosenIndex }));
    socket.emit('answer:submit', { questionId: state.question.questionId, chosenIndex }, (ack) => {
      if (!ack.ok && ack.error !== 'already_answered') {
        setAnswerError(JOIN_ERROR_MESSAGES[ack.error]);
        if (ack.error === 'too_early' || ack.error === 'server_error') {
          setState((current) => ({ ...current, answered: false, chosenIndex: null }));
        }
      }
    });
  }

  if (state.replaced) {
    return (
      <PlayStage width="sm">
        <div className={`${CARD} space-y-5 p-6 text-center`}>
          <Notice tone="warning">
            This quiz is open on another device, so this one was disconnected. Only one device can
            use your place at a time.
          </Notice>
          <button
            type="button"
            className={`${ctaPrimary} ${ctaSize.lg} w-full`}
            onClick={() => {
              setState((current) => ({ ...current, replaced: false }));
              socket?.connect();
            }}
          >
            Use this device
          </button>
        </div>
      </PlayStage>
    );
  }

  if (state.joinError) {
    return (
      <PlayStage width="sm">
        <div className={`${CARD} space-y-5 p-6 text-center`}>
          <Notice tone="danger">
            {state.needsName
              ? 'Enter your name to join this quiz.'
              : JOIN_ERROR_MESSAGES[state.joinError]}
          </Notice>
          <Link to={`/join/${joinCode}`} className={`${ctaPrimary} ${ctaSize.lg} w-full`}>
            Back to join
          </Link>
        </div>
      </PlayStage>
    );
  }

  if (!state.participantId || !synced) {
    return (
      <PlayStage width="sm">
        <PageLoader label="Connecting..." />
      </PlayStage>
    );
  }

  if (
    shouldShowIntro({
      introDone,
      mode: state.mode,
      status: state.status,
      examPhase: state.exam?.phase ?? null,
    })
  ) {
    return (
      <StudentIntro
        quizTitle={state.quizTitle}
        displayName={state.displayName}
        branding={state.branding}
        assessmentType={state.mode === 'exam' ? 'exam' : state.adaptive ? 'adaptive' : 'live'}
        durationMinutes={state.exam?.durationMinutes}
        onDone={() => {
          markIntroDone(joinCode);
          setIntroDone(true);
        }}
      />
    );
  }

  if (
    shouldShowPrecheck({
      precheckDone,
      proctored: state.proctored,
      camera: state.proctorCamera,
      mic: state.proctorMic,
      status: state.status,
    })
  ) {
    return (
      <ProctorPrecheck
        camera={state.proctorCamera}
        mic={state.proctorMic}
        onContinue={() => {
          markPrecheckDone(joinCode);
          setPrecheckDone(true);
        }}
      />
    );
  }

  const media = {
    camera: state.proctorCamera,
    mic: state.proctorMic,
    flagLimit: state.proctorFlagLimit,
  };

  if (state.mode === 'exam' && state.exam && socket) {
    return (
      <ExamPlay
        socket={socket}
        view={state.exam}
        displayName={state.displayName}
        offsetMs={offsetMs}
        connected={state.connected}
        proctored={state.proctored}
        media={media}
        submitReason={state.examSubmitReason}
        onViewChange={(exam) => setState((current) => ({ ...current, exam }))}
      />
    );
  }

  const header = (
    <>
      {!state.connected && <ConnectionBanner />}
      {state.proctored && state.status !== 'ended' && socket && (
        <LiveProctor
          socket={socket}
          active={state.status === 'running'}
          connected={state.connected}
        />
      )}
      {state.proctored && (media.camera || media.mic) && state.status !== 'ended' && socket && (
        <MediaProctorLayer
          socket={socket}
          room={{
            proctorCamera: media.camera,
            proctorMic: media.mic,
            proctorFlagLimit: media.flagLimit,
          }}
          active={state.status === 'running'}
          now={() => Date.now() + offsetMs}
        />
      )}
      <PlayerBar name={state.displayName} standing={state.standing} />
    </>
  );

  if (state.status === 'ended') {
    return (
      <PlayStage width="sm">
        {header}
        <div className={`${CARD} px-6 py-8 text-center`}>
          <h1 className="text-[1.75rem] font-medium tracking-[-0.03em]">Final results</h1>
          {state.standing && (
            <>
              <p className="mt-5 font-geist-mono text-6xl font-medium tracking-tight tabular-nums">
                #{state.standing.rank}
              </p>
              <p className="mt-3 text-night/60">
                You finished{' '}
                <strong className="font-medium text-night tabular-nums">
                  #{state.standing.rank}
                </strong>{' '}
                with{' '}
                <strong className="font-medium text-night tabular-nums">
                  {state.standing.score.toLocaleString()}
                </strong>{' '}
                points
              </p>
            </>
          )}
        </div>
        <Leaderboard entries={state.leaderboard} highlightParticipantId={state.participantId} />
        {socket && (
          <FeedbackForm submit={(payload) => socket.emitWithAck('feedback:submit', payload)} />
        )}
      </PlayStage>
    );
  }

  if (state.status === 'lobby' || !state.question) {
    return (
      <PlayStage width="sm">
        {header}
        <div className={`${CARD} relative overflow-hidden px-6 pt-10 pb-16 text-center`}>
          <h1 className="text-[1.75rem] font-medium tracking-[-0.03em]">You are in</h1>
          <p className="mt-2 text-night/60">Waiting for the host to start the quiz.</p>
          <div className="mt-5 flex justify-center">
            <WaitingDots />
          </div>
          <p className="mt-6 text-sm text-night/55">
            Join code{' '}
            <span className="ml-1 rounded-lg bg-night/[0.05] px-2.5 py-1 font-geist-mono font-medium tracking-[0.2em] text-night tabular-nums">
              {joinCode}
            </span>
          </p>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-14">
            <Texture field="rise" color="var(--color-accent-400)" opacity={0.28} cell={3} />
          </div>
        </div>
      </PlayStage>
    );
  }

  if (state.questionClosed && state.result) {
    const you = state.result.you;
    const outcome =
      you?.chosenIndex === null || you === null ? 'timeout' : you.correct ? 'correct' : 'wrong';
    const tone = {
      correct: 'bg-accent-50 text-accent-900 shadow-[0_0_0_1.5px_var(--color-accent-500)]',
      wrong: 'bg-alert-soft text-alert shadow-[0_0_0_1.5px_rgba(180,35,24,0.4)]',
      timeout: 'bg-white text-night shadow-[0_0_0_1px_rgba(17,16,20,0.12)]',
    }[outcome];
    return (
      <PlayStage width="sm">
        {header}
        <div role="status" className={`rounded-2xl px-6 py-7 text-center ${tone}`}>
          <span
            aria-hidden="true"
            className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full ${
              outcome === 'correct'
                ? 'bg-accent-500 text-white'
                : outcome === 'wrong'
                  ? 'bg-alert text-white'
                  : 'bg-night/10 text-night/60'
            }`}
          >
            <AppIcon size={22}>
              {outcome === 'correct'
                ? ICONS.check
                : outcome === 'wrong'
                  ? ICONS.close
                  : ICONS.clock}
            </AppIcon>
          </span>
          <p className="mt-3 text-[1.5rem] font-medium tracking-[-0.02em]">
            {outcome === 'timeout' ? "Time's up" : outcome === 'correct' ? 'Correct' : 'Not quite'}
          </p>
          <p className="mt-1 font-geist-mono text-xl tabular-nums">
            +{you?.pointsAwarded ?? 0} points
          </p>
          {you && (
            <p className="mt-1 text-sm opacity-75">
              {you.totalPoints.toLocaleString()} total, rank {you.rank}
            </p>
          )}
        </div>
        <p className={`${CARD} px-4 py-3 text-center text-sm text-night/60`}>
          Correct answer:{' '}
          <span className="font-medium text-night">
            {OPTION_LETTERS[state.result.correctIndex]}.{' '}
            {state.question.options[state.result.correctIndex]}
          </span>
        </p>
        <Leaderboard entries={state.leaderboard} highlightParticipantId={state.participantId} />
        <p className="flex items-center justify-center gap-3 text-sm text-night/55">
          Waiting for the next question <WaitingDots />
        </p>
      </PlayStage>
    );
  }

  const hasStarted = serverNowMs >= state.question.startsAtServerMs;
  const hasEnded = serverNowMs >= state.question.startsAtServerMs + state.question.durationMs;
  const locked = state.answered || hasEnded;

  return (
    <PlayStage width="lg">
      {header}
      <div className={`${CARD} p-5 sm:p-6`}>
        <QuestionTimer
          serverNowMs={serverNowMs}
          startsAtServerMs={state.question.startsAtServerMs}
          durationMs={state.question.durationMs}
        />
      </div>
      {hasStarted && (
        <>
          <div className={`${CARD} space-y-4 p-5 sm:p-6`}>
            <h1 className="text-xl leading-snug font-medium tracking-tight break-words [overflow-wrap:anywhere] sm:text-2xl">
              {state.question.stem}
            </h1>
            <QuestionImage imageUrl={state.question.imageUrl} imageAlt={state.question.imageAlt} />
          </div>
          <div role="group" aria-label="Answers" className="grid gap-3 sm:grid-cols-2">
            {state.question.options.map((option, optionIndex) => {
              const chosen = state.chosenIndex === optionIndex;
              return (
                <button
                  key={OPTION_LETTERS[optionIndex]}
                  type="button"
                  disabled={locked}
                  aria-pressed={chosen}
                  onClick={() => submitAnswer(optionIndex)}
                  className={`flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left text-[1.0625rem] font-medium break-words transition-[background-color,box-shadow,color,transform] duration-200 ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night enabled:active:scale-[0.98] disabled:cursor-not-allowed ${
                    chosen
                      ? 'bg-night text-white shadow-[0_0_0_1px_rgba(17,16,20,1)]'
                      : locked
                        ? 'bg-white/60 text-night/45 shadow-[0_0_0_1px_rgba(17,16,20,0.08)]'
                        : 'bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.12),0_1px_3px_rgba(17,16,20,0.05)] hover:shadow-[0_0_0_1.5px_rgba(17,16,20,0.45)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-geist-mono text-sm font-medium ${
                      chosen ? 'bg-white/15 text-white' : 'bg-night/[0.06] text-night/60'
                    }`}
                  >
                    {OPTION_LETTERS[optionIndex]}
                  </span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{option}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {state.answered && (
        <p role="status" className="text-center text-sm font-medium text-night/60">
          Answer locked. Waiting for the others...
        </p>
      )}
      {!state.answered && hasEnded && (
        <p role="status" className="text-center text-sm font-medium text-night/60">
          Time&apos;s up
        </p>
      )}
      {answerError && <Notice tone="danger">{answerError}</Notice>}
    </PlayStage>
  );
}
