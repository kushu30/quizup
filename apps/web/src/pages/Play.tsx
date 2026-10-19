import type {
  ExamStudentView,
  LeaderboardEntry,
  QuestionResultPayload,
  QuestionShowPayload,
  RoomStatePayload,
  SessionStatus,
  SocketErrorCode,
} from '@quizup/shared';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ExamPlay } from '../components/exam/ExamPlay';
import { Leaderboard } from '../components/Leaderboard';
import { QuestionTimer } from '../components/QuestionTimer';
import { useClockSync } from '../hooks/useClockSync';
import { useServerNow } from '../hooks/useServerNow';
import { createQuizSocket, type QuizSocket } from '../lib/socket';
import { clearStoredJoin, readStoredJoin, writeStoredJoin } from '../lib/storedJoin';

interface PlayState {
  connected: boolean;
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
}

const INITIAL_STATE: PlayState = {
  connected: false,
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
};

const OPTION_STYLES = [
  'bg-rose-600 hover:bg-rose-700',
  'bg-sky-600 hover:bg-sky-700',
  'bg-amber-500 hover:bg-amber-600',
  'bg-emerald-600 hover:bg-emerald-700',
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
  name_taken: 'That name is already taken in this quiz. Pick another.',
  invalid_rejoin_token: 'Your seat could not be restored. Join again with a new name.',
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
};

export function Play() {
  const { code = '' } = useParams();
  const joinCode = code.toUpperCase();
  const location = useLocation();
  const stateDisplayName = (location.state as { displayName?: string } | null)?.displayName;

  const [socket, setSocket] = useState<QuizSocket | null>(null);
  const [state, setState] = useState<PlayState>(INITIAL_STATE);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const { offsetMs, synced } = useClockSync(socket);
  const serverNowMs = useServerNow(offsetMs);

  useEffect(() => {
    const quizSocket = createQuizSocket();
    setSocket(quizSocket);

    function joinRoom() {
      const stored = readStoredJoin(joinCode);
      const displayName = stored?.displayName ?? stateDisplayName;
      if (!displayName) {
        setState((current) => ({ ...current, connected: true, joinError: 'invalid_payload' }));
        return;
      }
      quizSocket.emit(
        'room:join',
        { joinCode, displayName, rejoinToken: stored?.rejoinToken },
        (ack) => {
          if (!ack.ok) {
            if (ack.error === 'invalid_rejoin_token' || ack.error === 'session_not_found') {
              clearStoredJoin(joinCode);
            }
            setState((current) => ({ ...current, connected: true, joinError: ack.error }));
            return;
          }
          if (ack.role === 'student') {
            writeStoredJoin(joinCode, {
              participantId: ack.participantId,
              rejoinToken: ack.rejoinToken,
              displayName,
            });
            setState((current) => ({
              ...current,
              connected: true,
              joinError: null,
              participantId: ack.participantId,
              displayName,
            }));
          }
        },
      );
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
      }));
    }

    quizSocket.on('connect', joinRoom);
    quizSocket.on('disconnect', () => setState((current) => ({ ...current, connected: false })));
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
      quizSocket.disconnect();
      setSocket(null);
    };
  }, [joinCode, stateDisplayName]);

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

  if (state.joinError) {
    return (
      <div className="mx-auto max-w-sm space-y-4 text-center">
        <p className="text-lg text-red-700">
          {stateDisplayName || readStoredJoin(joinCode)
            ? JOIN_ERROR_MESSAGES[state.joinError]
            : 'Enter your name to join this quiz.'}
        </p>
        <Link to="/join" className="inline-block rounded-md bg-slate-900 px-4 py-3 text-white">
          Back to join
        </Link>
      </div>
    );
  }

  if (!state.connected || !state.participantId || !synced) {
    return <p className="text-center text-slate-600">Connecting...</p>;
  }

  if (state.mode === 'exam' && state.exam && socket) {
    return (
      <ExamPlay
        socket={socket}
        view={state.exam}
        displayName={state.displayName}
        offsetMs={offsetMs}
        connected={state.connected}
        onViewChange={(exam) => setState((current) => ({ ...current, exam }))}
      />
    );
  }

  const header = (
    <div className="flex items-center justify-between text-sm text-slate-600">
      <span>{state.displayName}</span>
      {state.standing && (
        <span>
          Rank {state.standing.rank} · {state.standing.score} pts
        </span>
      )}
    </div>
  );

  if (state.status === 'ended') {
    return (
      <div className="mx-auto max-w-md space-y-4">
        {header}
        <h1 className="text-center text-3xl font-bold">Final results</h1>
        {state.standing && (
          <p className="text-center text-xl">
            You finished <strong>#{state.standing.rank}</strong> with{' '}
            <strong>{state.standing.score}</strong> points
          </p>
        )}
        <Leaderboard entries={state.leaderboard} highlightParticipantId={state.participantId} />
      </div>
    );
  }

  if (state.status === 'lobby' || !state.question) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        {header}
        <h1 className="text-2xl font-bold">You are in!</h1>
        <p className="text-slate-600">Waiting for the host to start the quiz.</p>
        <p className="text-sm text-slate-500">Join code {joinCode}</p>
      </div>
    );
  }

  if (state.questionClosed && state.result) {
    const you = state.result.you;
    return (
      <div className="mx-auto max-w-md space-y-4">
        {header}
        <div
          className={`rounded-xl p-6 text-center text-white ${
            you?.correct ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          <p className="text-3xl font-bold">
            {you?.chosenIndex === null || you === null
              ? "Time's up"
              : you.correct
                ? 'Correct!'
                : 'Not quite'}
          </p>
          <p className="mt-2 text-xl">+{you?.pointsAwarded ?? 0} points</p>
          {you && (
            <p className="mt-1">
              {you.totalPoints} total · rank {you.rank}
            </p>
          )}
        </div>
        <p className="text-center text-sm text-slate-600">
          Correct answer: {OPTION_LETTERS[state.result.correctIndex]}.{' '}
          {state.question.options[state.result.correctIndex]}
        </p>
        <Leaderboard entries={state.leaderboard} highlightParticipantId={state.participantId} />
        <p className="text-center text-sm text-slate-500">Waiting for the next question...</p>
      </div>
    );
  }

  const hasStarted = serverNowMs >= state.question.startsAtServerMs;
  const hasEnded = serverNowMs >= state.question.startsAtServerMs + state.question.durationMs;

  return (
    <div className="mx-auto max-w-md space-y-4">
      {header}
      <QuestionTimer
        serverNowMs={serverNowMs}
        startsAtServerMs={state.question.startsAtServerMs}
        durationMs={state.question.durationMs}
      />
      {hasStarted && (
        <>
          <h1 className="text-xl font-semibold">{state.question.stem}</h1>
          <div className="grid gap-3">
            {state.question.options.map((option, optionIndex) => (
              <button
                key={OPTION_LETTERS[optionIndex]}
                type="button"
                disabled={state.answered || hasEnded}
                onClick={() => submitAnswer(optionIndex)}
                className={`min-h-20 rounded-xl px-4 py-4 text-left text-lg font-medium text-white disabled:opacity-60 ${
                  OPTION_STYLES[optionIndex]
                } ${state.chosenIndex === optionIndex ? 'ring-4 ring-slate-900' : ''}`}
              >
                <span className="mr-3 font-bold">{OPTION_LETTERS[optionIndex]}</span>
                {option}
              </button>
            ))}
          </div>
        </>
      )}
      {state.answered && (
        <p className="text-center text-slate-700">Answer locked. Waiting for the others...</p>
      )}
      {!state.answered && hasEnded && <p className="text-center text-slate-700">Time's up</p>}
      {answerError && <p className="text-center text-sm text-red-700">{answerError}</p>}
    </div>
  );
}
