import type {
  Branding,
  ClientHints,
  ExamStudentView,
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
import { Button, Notice, buttonClasses } from '../components/ui';
import { useProctor } from '../hooks/useProctor';
import { useClockSync } from '../hooks/useClockSync';
import { useServerNow } from '../hooks/useServerNow';
import { createQuizSocket, type QuizSocket } from '../lib/socket';
import { supabase } from '../lib/supabase';
import { usePageBrand } from '../lib/brandContext';
import { markIntroDone, readIntroDone, shouldShowIntro } from '../lib/introGate';
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
  quizTitle: '',
  branding: null,
};

const OPTION_STYLES = [
  'bg-answer-a text-white',
  'bg-answer-b text-white',
  'bg-answer-c text-ink',
  'bg-answer-d text-white',
];
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
      quizSocket.on('exam:submitted', () => {
        setState((current) =>
          current.exam
            ? {
                ...current,
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
      <div className="mx-auto max-w-md space-y-5 text-center">
        <Notice tone="warning">
          This quiz is open on another device, so this one was disconnected. Only one device can use
          your place at a time.
        </Notice>
        <Button
          size="lg"
          onClick={() => {
            setState((current) => ({ ...current, replaced: false }));
            socket?.connect();
          }}
        >
          Use this device
        </Button>
      </div>
    );
  }

  if (state.joinError) {
    return (
      <div className="mx-auto max-w-md space-y-5 text-center">
        <Notice tone="danger">
          {state.needsName
            ? 'Enter your name to join this quiz.'
            : JOIN_ERROR_MESSAGES[state.joinError]}
        </Notice>
        <Link to={`/join/${joinCode}`} className={buttonClasses('primary', 'lg')}>
          Back to join
        </Link>
      </div>
    );
  }

  if (!state.participantId || !synced) {
    return (
      <p role="status" className="py-16 text-center text-lg text-muted">
        Connecting...
      </p>
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

  if (state.mode === 'exam' && state.exam && socket) {
    return (
      <ExamPlay
        socket={socket}
        view={state.exam}
        displayName={state.displayName}
        offsetMs={offsetMs}
        connected={state.connected}
        proctored={state.proctored}
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
      <div className="flex items-center justify-between gap-3 border-b border-rule pb-3 text-sm">
        <span className="min-w-0 truncate font-semibold">{state.displayName}</span>
        {state.standing && (
          <span className="shrink-0 text-muted">
            Rank {state.standing.rank}, {state.standing.score.toLocaleString()} points
          </span>
        )}
      </div>
    </>
  );

  if (state.status === 'ended') {
    return (
      <div className="mx-auto max-w-md space-y-6">
        {header}
        <div className="space-y-2 text-center">
          <h1 className="text-title font-semibold tracking-tight">Final results</h1>
          {state.standing && (
            <p className="text-lg text-muted">
              You finished{' '}
              <strong className="font-semibold text-ink tabular-nums">
                #{state.standing.rank}
              </strong>{' '}
              with{' '}
              <strong className="font-semibold text-ink tabular-nums">
                {state.standing.score.toLocaleString()}
              </strong>{' '}
              points
            </p>
          )}
        </div>
        <Leaderboard entries={state.leaderboard} highlightParticipantId={state.participantId} />
        {socket && (
          <FeedbackForm submit={(payload) => socket.emitWithAck('feedback:submit', payload)} />
        )}
      </div>
    );
  }

  if (state.status === 'lobby' || !state.question) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        {header}
        <div className="space-y-3 py-8 text-center">
          <h1 className="text-title font-semibold tracking-tight">You are in</h1>
          <p className="text-lg text-muted">Waiting for the host to start the quiz.</p>
          <p className="text-sm text-muted">
            Join code{' '}
            <span className="rounded bg-board-soft px-2 py-1 font-semibold tracking-[0.2em] text-board tabular-nums">
              {joinCode}
            </span>
          </p>
        </div>
      </div>
    );
  }

  if (state.questionClosed && state.result) {
    const you = state.result.you;
    const outcome =
      you?.chosenIndex === null || you === null ? 'timeout' : you.correct ? 'correct' : 'wrong';
    const outcomeStyle =
      outcome === 'correct' ? 'bg-success' : outcome === 'wrong' ? 'bg-alert' : 'bg-ink';
    return (
      <div className="mx-auto max-w-md space-y-5">
        {header}
        <div role="status" className={`rounded-lg p-6 text-center text-white ${outcomeStyle}`}>
          <p className="text-title font-semibold">
            {outcome === 'timeout' ? "Time's up" : outcome === 'correct' ? 'Correct' : 'Not quite'}
          </p>
          <p className="mt-2 text-xl tabular-nums">+{you?.pointsAwarded ?? 0} points</p>
          {you && (
            <p className="mt-1 text-white/85">
              {you.totalPoints.toLocaleString()} total, rank {you.rank}
            </p>
          )}
        </div>
        <p className="text-center text-sm text-muted">
          Correct answer:{' '}
          <span className="font-semibold text-ink">
            {OPTION_LETTERS[state.result.correctIndex]}.{' '}
            {state.question.options[state.result.correctIndex]}
          </span>
        </p>
        <Leaderboard entries={state.leaderboard} highlightParticipantId={state.participantId} />
        <p className="text-center text-sm text-muted">Waiting for the next question...</p>
      </div>
    );
  }

  const hasStarted = serverNowMs >= state.question.startsAtServerMs;
  const hasEnded = serverNowMs >= state.question.startsAtServerMs + state.question.durationMs;
  const locked = state.answered || hasEnded;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {header}
      <QuestionTimer
        serverNowMs={serverNowMs}
        startsAtServerMs={state.question.startsAtServerMs}
        durationMs={state.question.durationMs}
      />
      {hasStarted && (
        <>
          <h1 className="text-xl font-semibold break-words sm:text-2xl">{state.question.stem}</h1>
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
                  className={`flex min-h-20 w-full items-center gap-4 rounded-lg px-4 py-4 text-left text-lg font-semibold break-words transition hover:brightness-110 disabled:cursor-not-allowed disabled:hover:brightness-100 ${
                    OPTION_STYLES[optionIndex]
                  } ${chosen ? 'ring-4 ring-ink ring-offset-2 ring-offset-paper' : locked ? 'opacity-45' : ''}`}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/25 text-base font-bold"
                  >
                    {OPTION_LETTERS[optionIndex]}
                  </span>
                  <span className="min-w-0">{option}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {state.answered && (
        <p role="status" className="text-center font-medium text-muted">
          Answer locked. Waiting for the others...
        </p>
      )}
      {!state.answered && hasEnded && (
        <p role="status" className="text-center font-medium text-muted">
          Time&apos;s up
        </p>
      )}
      {answerError && <Notice tone="danger">{answerError}</Notice>}
    </div>
  );
}
