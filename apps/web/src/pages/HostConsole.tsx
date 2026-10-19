import type { RoomStatePayload, SocketErrorCode } from '@quizup/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdaptiveTable } from '../components/AdaptiveTable';
import { Leaderboard } from '../components/Leaderboard';
import { QuestionTimer } from '../components/QuestionTimer';
import { useClockSync } from '../hooks/useClockSync';
import { useServerNow } from '../hooks/useServerNow';
import { api, describeError } from '../lib/api';
import { createQuizSocket, type QuizSocket } from '../lib/socket';
import { supabase } from '../lib/supabase';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const OPTION_BAR_COLORS = ['bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-500'];

export function HostConsole() {
  const { sessionId = '' } = useParams();
  const [socket, setSocket] = useState<QuizSocket | null>(null);
  const [room, setRoom] = useState<RoomStatePayload | null>(null);
  const [joinError, setJoinError] = useState<SocketErrorCode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { offsetMs } = useClockSync(socket);
  const serverNowMs = useServerNow(offsetMs);

  useEffect(() => {
    let cancelled = false;
    let hostSocket: QuizSocket | null = null;

    async function connect() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) {
        return;
      }
      hostSocket = createQuizSocket(data.session?.access_token);
      hostSocket.on('connect', () => {
        hostSocket?.emit('room:join', { sessionId }, (ack) => {
          setJoinError(ack.ok ? null : ack.error);
        });
      });
      hostSocket.on('room:state', setRoom);
      setSocket(hostSocket);
    }

    void connect();
    return () => {
      cancelled = true;
      hostSocket?.disconnect();
      setSocket(null);
    };
  }, [sessionId]);

  const runCommand = useCallback(async (command: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await command();
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }, []);

  if (joinError) {
    return (
      <div className="space-y-3">
        <p className="text-red-700">
          {joinError === 'session_not_found'
            ? 'This session is not live. Start a new one from the quiz editor.'
            : 'You cannot control this session.'}
        </p>
        <Link to="/host" className="underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!room) {
    return <p className="text-slate-600">Connecting...</p>;
  }

  const question = room.currentQuestion;
  const connectedCount = room.participants.filter((participant) => participant.connected).length;
  const round = room.round;
  const isLastQuestion = question ? question.questionNumber === question.totalQuestions : false;
  const isLastRound = round ? round.roundNumber === round.totalRounds : false;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm uppercase tracking-wide text-slate-500">Join code</p>
        <p className="text-6xl font-bold tracking-widest sm:text-8xl">{room.joinCode}</p>
        <p className="text-sm text-slate-500">Students join at {window.location.origin}/join</p>
      </div>

      {message && <p className="text-center text-sm text-red-700">{message}</p>}

      {room.status === 'lobby' && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            Lobby · {connectedCount} connected of {room.participants.length}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {room.participants.map((participant) => (
              <li
                key={participant.participantId}
                className={`rounded-full px-3 py-1 text-sm ${
                  participant.connected
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {participant.displayName}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy || room.participants.length === 0}
            onClick={() => void runCommand(() => api.startSession(sessionId))}
            className="rounded-md bg-slate-900 px-6 py-3 text-lg text-white disabled:opacity-50"
          >
            Start quiz
          </button>
        </section>
      )}

      {room.status === 'running' && room.adaptive && round && (
        <section className="space-y-4">
          <p className="text-sm text-slate-600">
            Adaptive round {round.roundNumber} of {round.totalRounds}. Each student has their own
            question.
          </p>

          {!room.questionClosed && (
            <>
              <QuestionTimer
                serverNowMs={serverNowMs}
                startsAtServerMs={round.startsAtServerMs}
                durationMs={round.durationMs}
              />
              <p className="text-center text-lg">
                {room.answeredCount ?? 0} of {room.participants.length} answered
              </p>
            </>
          )}

          <h3 className="text-lg font-semibold">Students</h3>
          <AdaptiveTable rows={room.adaptiveTable ?? []} />

          {room.questionClosed && (
            <>
              <h3 className="text-lg font-semibold">Leaderboard</h3>
              <Leaderboard entries={room.leaderboard} />
              <button
                type="button"
                disabled={busy}
                onClick={() => void runCommand(() => api.nextQuestion(sessionId))}
                className="rounded-md bg-slate-900 px-6 py-3 text-lg text-white disabled:opacity-50"
              >
                {isLastRound ? 'Show final results' : 'Next round'}
              </button>
            </>
          )}
        </section>
      )}

      {room.status === 'running' && !room.adaptive && question && (
        <section className="space-y-4">
          <p className="text-sm text-slate-600">
            Question {question.questionNumber} of {question.totalQuestions}
          </p>
          <h2 className="text-2xl font-semibold">{question.stem}</h2>

          {!room.questionClosed && (
            <>
              <QuestionTimer
                serverNowMs={serverNowMs}
                startsAtServerMs={question.startsAtServerMs}
                durationMs={question.durationMs}
              />
              <p className="text-center text-lg">
                {room.answeredCount ?? 0} of {room.participants.length} answered
              </p>
            </>
          )}

          <ul className="space-y-2">
            {question.options.map((option, optionIndex) => {
              const optionCounts = room.lastResult?.optionCounts ?? null;
              const count = optionCounts?.[optionIndex] ?? 0;
              const total = optionCounts
                ? Math.max(
                    optionCounts.reduce((sum, value) => sum + value, 0),
                    1,
                  )
                : 1;
              const isCorrect = room.lastResult?.correctIndex === optionIndex;
              return (
                <li
                  key={OPTION_LETTERS[optionIndex]}
                  className={`rounded-lg border p-3 ${
                    isCorrect ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex justify-between">
                    <span>
                      <strong className="mr-2">{OPTION_LETTERS[optionIndex]}</strong>
                      {option}
                      {isCorrect ? ' (correct)' : ''}
                    </span>
                    {room.lastResult && <span>{count}</span>}
                  </div>
                  {room.lastResult && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full ${OPTION_BAR_COLORS[optionIndex]}`}
                        style={{ width: `${(count / total) * 100}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {room.questionClosed && (
            <>
              <h3 className="text-lg font-semibold">Leaderboard</h3>
              <Leaderboard entries={room.leaderboard} />
              <button
                type="button"
                disabled={busy}
                onClick={() => void runCommand(() => api.nextQuestion(sessionId))}
                className="rounded-md bg-slate-900 px-6 py-3 text-lg text-white disabled:opacity-50"
              >
                {isLastQuestion ? 'Show final results' : 'Next question'}
              </button>
            </>
          )}
        </section>
      )}

      {room.status === 'ended' && (
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Final results</h2>
          <Leaderboard entries={room.leaderboard} />
          {room.adaptiveTable && <AdaptiveTable rows={room.adaptiveTable} />}
          <Link to="/host" className="inline-block underline">
            Back to dashboard
          </Link>
        </section>
      )}

      {room.status !== 'ended' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm('End this session now?')) {
              void runCommand(() => api.endSession(sessionId));
            }
          }}
          className="rounded-md border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50"
        >
          End session
        </button>
      )}
    </div>
  );
}
