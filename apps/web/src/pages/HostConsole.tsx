import {
  hasBranding,
  type AnalyticsSnapshot,
  type ExamProgressRow,
  type ProctorEventRecord,
  type ProctorParticipantTimeline,
  type RoomStatePayload,
  type SocketErrorCode,
} from '@quizup/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdaptiveTable } from '../components/AdaptiveTable';
import { CopyButton } from '../components/CopyButton';
import { JoinQr } from '../components/JoinQr';
import { BrandMark } from '../components/branding/BrandMark';
import { ExamProgressTable } from '../components/exam/ExamProgressTable';
import { ProctorTimeline } from '../components/exam/ProctorTimeline';
import { AnalyticsPanel } from '../components/analytics/AnalyticsPanel';
import { Leaderboard } from '../components/Leaderboard';
import { RosterPanel } from '../components/RosterPanel';
import { StudentRoster } from '../components/StudentRoster';
import { Button, Notice, Panel, buttonClasses } from '../components/ui';
import { QuestionTimer } from '../components/QuestionTimer';
import { useClockSync } from '../hooks/useClockSync';
import { useServerNow } from '../hooks/useServerNow';
import { readableTextOn } from '../lib/brandColor';
import { mergeProctorEvents } from '../lib/proctorEvents';
import { api, describeError } from '../lib/api';
import { createQuizSocket, type QuizSocket } from '../lib/socket';
import { supabase } from '../lib/supabase';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];
const OPTION_BAR_COLORS = ['bg-answer-a', 'bg-answer-b', 'bg-answer-c', 'bg-answer-d'];

export function HostConsole() {
  const { sessionId = '' } = useParams();
  const [socket, setSocket] = useState<QuizSocket | null>(null);
  const [room, setRoom] = useState<RoomStatePayload | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [examRows, setExamRows] = useState<ExamProgressRow[] | null>(null);
  const [resultsReleased, setResultsReleased] = useState(false);
  const [liveProctor, setLiveProctor] = useState<Record<string, ProctorEventRecord[]>>({});
  const [loadedTimelines, setLoadedTimelines] = useState<ProctorParticipantTimeline[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
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
        setConnected(true);
        hostSocket?.emit('room:join', { sessionId }, (ack) => {
          setJoinError(ack.ok ? null : ack.error);
        });
      });
      hostSocket.on('disconnect', () => setConnected(false));
      hostSocket.on('room:state', (state) => {
        setRoom(state);
        if (state.examProgress) {
          setExamRows(state.examProgress);
        }
      });
      hostSocket.on('exam:progress', (payload) => {
        setExamRows(payload.rows);
        setResultsReleased(payload.resultsReleased);
      });
      hostSocket.on('proctor:timeline', (record) => {
        setLiveProctor((current) => ({
          ...current,
          [record.participantId]: [...(current[record.participantId] ?? []), record],
        }));
      });
      hostSocket.on('analytics:snapshot', setAnalytics);
      setSocket(hostSocket);
    }

    void connect();
    return () => {
      cancelled = true;
      hostSocket?.disconnect();
      setSocket(null);
    };
  }, [sessionId]);

  const isExamSession = room?.mode === 'exam';
  useEffect(() => {
    if (!isExamSession || !connected) {
      return;
    }
    let cancelled = false;
    api
      .getProctorTimeline(sessionId)
      .then((timelines) => {
        if (!cancelled) {
          setLoadedTimelines(timelines);
          setLiveProctor({});
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
  }, [isExamSession, connected, sessionId]);

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
      <div className="mx-auto max-w-xl space-y-4">
        <Notice tone="danger">
          {joinError === 'session_not_found'
            ? 'This session is not live. Start a new one from the quiz editor.'
            : 'You cannot control this session.'}
        </Notice>
        <Link to="/host" className={buttonClasses('secondary', 'md')}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!room) {
    return (
      <p role="status" className="py-16 text-center text-lg text-muted">
        Connecting...
      </p>
    );
  }

  const isExam = room.mode === 'exam';
  const joinUrl = `${window.location.origin}/join/${room.joinCode}`;
  const panelColor = room.branding?.brandColor ?? '#1e5446';
  const panelText = readableTextOn(panelColor);
  const selectedRow = examRows?.find((row) => row.participantId === selectedStudentId) ?? null;
  const selectedEvents = selectedStudentId
    ? mergeProctorEvents(
        loadedTimelines.find((timeline) => timeline.participantId === selectedStudentId)?.events ??
          [],
        liveProctor[selectedStudentId] ?? [],
      )
    : [];
  const rosterRefreshKey =
    room.participants.length * 1000 + room.participants.filter((entry) => entry.connected).length;
  const letBackIn =
    room.accessMode === 'open' && room.status !== 'ended'
      ? async (participantId: string) => {
          await api.allowRejoin(sessionId, participantId);
        }
      : undefined;
  const question = room.currentQuestion;
  const round = room.round;
  const isLastQuestion = question ? question.questionNumber === question.totalQuestions : false;
  const isLastRound = round ? round.roundNumber === round.totalRounds : false;
  const answeredLine = (
    <p className="text-center text-lg font-medium tabular-nums">
      {room.answeredCount ?? 0} of {room.participants.length} answered
    </p>
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <aside
          aria-label="Join details"
          className="space-y-4 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-6"
        >
          <div
            className="rounded-lg p-6 text-center"
            style={{ backgroundColor: panelColor, color: panelText }}
          >
            {hasBranding(room.branding) && (
              <div className="mb-5 flex justify-center border-b border-current/20 pb-4 text-left">
                <BrandMark
                  branding={room.branding}
                  tone={panelText === '#ffffff' ? 'dark' : 'light'}
                />
              </div>
            )}
            <p className="text-base font-medium opacity-85">Join code</p>
            <p className="mt-1 text-hero font-bold tracking-[0.18em] whitespace-nowrap tabular-nums sm:text-display lg:text-[3.5rem]">
              {room.joinCode}
            </p>
            <div
              className={`mx-auto mt-4 w-48 overflow-hidden rounded-md sm:w-56 ${
                room.status === 'lobby' ? '' : 'hidden lg:block'
              }`}
            >
              <JoinQr url={joinUrl} />
            </div>
            <p className="mt-4 text-sm opacity-85">Scan, or open</p>
            <p className="text-sm font-semibold break-all select-all">
              {joinUrl.replace(/^https?:\/\//, '')}
            </p>
            <div className="mt-3">
              <CopyButton
                text={joinUrl}
                label="Copy link"
                variant={panelText === '#ffffff' ? 'accent' : 'primary'}
                size="sm"
                statusClassName="min-h-5 text-sm opacity-85"
              />
            </div>
          </div>
          {room.status !== 'lobby' && (
            <StudentRoster participants={room.participants} onLetBackIn={letBackIn} />
          )}
        </aside>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          {message && <Notice tone="danger">{message}</Notice>}

          {room.status === 'lobby' && (
            <section aria-labelledby="lobby-heading" className="space-y-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-medium break-words text-muted">{room.quizTitle}</p>
                  <h1 id="lobby-heading" className="text-title font-semibold tracking-tight">
                    Waiting for students
                  </h1>
                  <p className="max-w-prose text-muted">
                    {room.mode === 'exam'
                      ? 'When everyone is in, open the exam. Each student starts their own timer after accepting the exam rules.'
                      : 'Students scan the QR code or enter the join code. Start the quiz when everyone you expect is on the list.'}
                  </p>
                </div>
                <Button
                  variant="brand"
                  size="lg"
                  disabled={busy || room.participants.length === 0}
                  onClick={() => void runCommand(() => api.startSession(sessionId))}
                >
                  {room.mode === 'exam' ? 'Open the exam' : 'Start quiz'}
                </Button>
              </div>
              <StudentRoster
                participants={room.participants}
                size="large"
                onLetBackIn={letBackIn}
              />
            </section>
          )}

          {isExam && room.status !== 'lobby' && (
            <section aria-labelledby="exam-heading" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 id="exam-heading" className="text-title font-semibold tracking-tight">
                  {room.status === 'ended' ? 'Exam ended' : 'Exam in progress'}
                </h1>
                <Button
                  variant="brand"
                  disabled={busy || resultsReleased}
                  onClick={() =>
                    void runCommand(async () => {
                      await api.releaseResults(sessionId);
                      setResultsReleased(true);
                    })
                  }
                >
                  {resultsReleased ? 'Results released' : 'Release results'}
                </Button>
              </div>
              <ExamProgressTable
                rows={examRows ?? []}
                offsetMs={offsetMs}
                selectedId={selectedStudentId}
                onSelect={setSelectedStudentId}
              />
              {selectedRow && (
                <ProctorTimeline
                  displayName={selectedRow.displayName}
                  attemptStartedAtMs={
                    selectedRow.startedAtServerMs ??
                    loadedTimelines.find(
                      (timeline) => timeline.participantId === selectedRow.participantId,
                    )?.attemptStartedAtMs ??
                    null
                  }
                  events={selectedEvents}
                  droppedEvents={selectedRow.droppedEvents}
                  onClose={() => setSelectedStudentId(null)}
                />
              )}
            </section>
          )}

          {room.status === 'running' && room.adaptive && round && (
            <section aria-labelledby="round-heading" className="space-y-5">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted">
                  Round {round.roundNumber} of {round.totalRounds}
                </p>
                <h1 id="round-heading" className="text-title font-semibold tracking-tight">
                  Adaptive round
                </h1>
                <p className="text-muted">Each student has their own question.</p>
              </div>

              {!room.questionClosed && (
                <div className="space-y-3">
                  <QuestionTimer
                    serverNowMs={serverNowMs}
                    startsAtServerMs={round.startsAtServerMs}
                    durationMs={round.durationMs}
                  />
                  {answeredLine}
                </div>
              )}

              <Panel title="Students" level={2}>
                <AdaptiveTable rows={room.adaptiveTable ?? []} />
              </Panel>

              {room.questionClosed && (
                <>
                  <Panel title="Leaderboard" level={2}>
                    <Leaderboard entries={room.leaderboard} />
                  </Panel>
                  <Button
                    size="lg"
                    disabled={busy}
                    onClick={() => void runCommand(() => api.nextQuestion(sessionId))}
                  >
                    {isLastRound ? 'Show final results' : 'Next round'}
                  </Button>
                </>
              )}
            </section>
          )}

          {room.status === 'running' && !room.adaptive && question && (
            <section aria-labelledby="question-heading" className="space-y-5">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted">
                  Question {question.questionNumber} of {question.totalQuestions}
                </p>
                <h1
                  id="question-heading"
                  className="text-title font-semibold tracking-tight break-words"
                >
                  {question.stem}
                </h1>
              </div>

              {!room.questionClosed && (
                <div className="space-y-3">
                  <QuestionTimer
                    serverNowMs={serverNowMs}
                    startsAtServerMs={question.startsAtServerMs}
                    durationMs={question.durationMs}
                  />
                  {answeredLine}
                </div>
              )}

              <ul className="grid gap-3 sm:grid-cols-2">
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
                      className={`rounded-lg border-2 bg-surface p-4 ${
                        isCorrect ? 'border-success' : 'border-rule'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex min-w-0 items-start gap-3">
                          <span
                            aria-hidden="true"
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
                              OPTION_BAR_COLORS[optionIndex]
                            } ${optionIndex === 2 ? 'text-ink' : 'text-white'}`}
                          >
                            {OPTION_LETTERS[optionIndex]}
                          </span>
                          <span className="min-w-0 pt-0.5 break-words">
                            <span className="sr-only">{OPTION_LETTERS[optionIndex]}. </span>
                            {option}
                            {isCorrect && (
                              <span className="ml-2 text-sm font-semibold text-success">
                                Correct
                              </span>
                            )}
                          </span>
                        </span>
                        {room.lastResult && (
                          <span className="shrink-0 pt-0.5 font-semibold tabular-nums">
                            {count}
                          </span>
                        )}
                      </div>
                      {room.lastResult && (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
                          <div
                            className={`h-full rounded-full ${OPTION_BAR_COLORS[optionIndex]}`}
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
                  <Panel title="Leaderboard" level={2}>
                    <Leaderboard entries={room.leaderboard} />
                  </Panel>
                  <Button
                    size="lg"
                    disabled={busy}
                    onClick={() => void runCommand(() => api.nextQuestion(sessionId))}
                  >
                    {isLastQuestion ? 'Show final results' : 'Next question'}
                  </Button>
                </>
              )}
            </section>
          )}

          {room.status === 'ended' && (
            <section aria-labelledby="final-heading" className="space-y-4">
              {!isExam && (
                <h1 id="final-heading" className="text-title font-semibold tracking-tight">
                  Final results
                </h1>
              )}
              {isExam && (
                <h2 id="final-heading" className="text-xl font-semibold">
                  Final results
                </h2>
              )}
              {!isExam && <Leaderboard entries={room.leaderboard} />}
              {room.adaptiveTable && <AdaptiveTable rows={room.adaptiveTable} />}
              <div className="flex flex-wrap gap-3">
                <Link
                  to={`/sessions/${sessionId}/summary`}
                  className={buttonClasses('primary', 'md')}
                >
                  Open the full summary and exports
                </Link>
                <Link to="/host" className={buttonClasses('secondary', 'md')}>
                  Back to dashboard
                </Link>
              </div>
            </section>
          )}

          {room.accessMode === 'token' && room.status !== 'ended' && (
            <RosterPanel
              sessionId={sessionId}
              joinCode={room.joinCode}
              refreshKey={rosterRefreshKey}
            />
          )}
        </div>
      </div>

      {!isExam && <AnalyticsPanel snapshot={analytics} connected={connected} />}

      {room.status !== 'ended' && (
        <div className="border-t border-rule pt-6">
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm('End this session now?')) {
                void runCommand(() => api.endSession(sessionId));
              }
            }}
          >
            End session
          </Button>
        </div>
      )}
    </div>
  );
}
