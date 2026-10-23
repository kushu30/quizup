import {
  hasBranding,
  quizSettingsSchema,
  type AnalyticsSnapshot,
  type ExamProgressRow,
  type ProctorEventRecord,
  type ProctorParticipantTimeline,
  type RoomStatePayload,
  type SocketErrorCode,
} from '@quizup/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdaptiveTable } from '../components/AdaptiveTable';
import { CopyButton } from '../components/CopyButton';
import { JoinQrZoom } from '../components/JoinQrZoom';
import { BrandMark } from '../components/branding/BrandMark';
import { ExamProgressTable } from '../components/exam/ExamProgressTable';
import { LiveProctorPanel } from '../components/exam/LiveProctorPanel';
import { ProctorTimeline } from '../components/exam/ProctorTimeline';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ProctoringChoiceDialog } from '../components/ProctoringChoiceDialog';
import { AnalyticsPanel } from '../components/analytics/AnalyticsPanel';
import { Leaderboard } from '../components/Leaderboard';
import { RosterPanel } from '../components/RosterPanel';
import { StudentRoster } from '../components/StudentRoster';
import { BLEED, PageBody, PageHeader } from '../components/app/Page';
import { AuthNotice } from '../components/landing/AuthField';
import { ctaLight, ctaPrimary, ctaSize } from '../components/landing/cta';
import { QuestionImage } from '../components/QuestionImage';
import { Texture } from '../components/landing/Texture';
import { Frame, RULE } from '../components/landing/frame';
import { Button, PageLoader, Panel, Tooltip } from '../components/ui';
import { InlineTimer } from '../components/QuestionTimer';
import { useClockSync } from '../hooks/useClockSync';
import { useServerNow } from '../hooks/useServerNow';
import { readableTextOn } from '../lib/brandColor';
import { mergeProctorEvents } from '../lib/proctorEvents';
import { api, describeError } from '../lib/api';
import { createQuizSocket, type QuizSocket } from '../lib/socket';
import { supabase } from '../lib/supabase';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

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
  const [choosingProctoring, setChoosingProctoring] = useState(false);
  // What the host saved on the quiz, so the Start dialog opens with those choices.
  const [savedProctoring, setSavedProctoring] = useState<{
    camera: boolean;
    mic: boolean;
    flagLimit: number | null;
  }>();
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [connected, setConnected] = useState(false);
  const [joinError, setJoinError] = useState<SocketErrorCode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { offsetMs } = useClockSync(socket);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const summary = await api.getSession(sessionId);
        const quiz = await api.getQuiz(summary.session.quiz_id);
        const settings = quizSettingsSchema.safeParse(quiz.settings);
        const saved = settings.success ? settings.data.proctoring : undefined;
        if (!cancelled && saved?.enabled) {
          setSavedProctoring({ camera: saved.camera, mic: saved.mic, flagLimit: saved.flagLimit });
        }
      } catch {
        // The dialog simply opens with nothing turned on.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);
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

  const isProctored = room?.proctored ?? false;
  useEffect(() => {
    if (!isProctored || !connected) {
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
  }, [isProctored, connected, sessionId]);

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
      <section className="flex flex-1 flex-col">
        <PageHeader title="Session" back={{ to: '/host', label: 'Quizzes' }} />
        <PageBody>
          <div className="max-w-xl space-y-4 px-4 pt-8 sm:px-10">
            <AuthNotice tone="danger">
              {joinError === 'session_not_found'
                ? 'This session is not live. Start a new one from the quiz editor.'
                : 'You cannot control this session.'}
            </AuthNotice>
            <Link to="/host" className={`${ctaLight} ${ctaSize.md}`}>
              Back to dashboard
            </Link>
          </div>
        </PageBody>
      </section>
    );
  }

  if (!room) {
    return (
      <section className="flex flex-1 flex-col">
        <PageHeader title="Session" back={{ to: '/host', label: 'Quizzes' }} />
        <PageBody>
          <PageLoader label="Connecting..." />
        </PageBody>
      </section>
    );
  }

  const isExam = room.mode === 'exam';
  const joinUrl = `${window.location.origin}/join/${room.joinCode}`;
  const branded = Boolean(room.branding?.brandColor);
  const panelColor = room.branding?.brandColor ?? '#111014';
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
  const devicesById = Object.fromEntries(
    room.participants.map((participant) => [participant.participantId, participant.devices]),
  );
  const allProctorEvents = room.participants.flatMap((participant) =>
    mergeProctorEvents(
      loadedTimelines.find((timeline) => timeline.participantId === participant.participantId)
        ?.events ?? [],
      liveProctor[participant.participantId] ?? [],
    ),
  );
  const liveSelected =
    room.participants.find((participant) => participant.participantId === selectedStudentId) ??
    null;
  const question = room.currentQuestion;
  const round = room.round;
  const isLastQuestion = question ? question.questionNumber === question.totalQuestions : false;
  const isLastRound = round ? round.roundNumber === round.totalRounds : false;
  const connectedCount = room.participants.filter((entry) => entry.connected).length;
  const answeredSum = analytics?.participants.reduce((sum, entry) => sum + entry.answered, 0) ?? 0;
  const correctSum = analytics?.participants.reduce((sum, entry) => sum + entry.correct, 0) ?? 0;
  const times =
    analytics?.participants
      .map((entry) => entry.avgResponseMs)
      .filter((value): value is number => value !== null) ?? [];
  const submitted = examRows?.filter((row) => row.status === 'submitted').length ?? 0;
  const examCount = (status: ExamProgressRow['status']) =>
    examRows?.filter((row) => row.status === status).length ?? 0;
  const examScores =
    examRows?.map((row) => row.score).filter((score): score is number => score !== null) ?? [];
  const figures: { label: string; value: string; tip: string }[] = isExam
    ? [
        {
          label: 'Students',
          value: `${connectedCount}/${room.participants.length}`,
          tip: 'Connected right now, out of everyone who has joined.',
        },
        {
          label: 'Not started',
          value: examRows ? String(examCount('not_started')) : '–',
          tip: 'Students who have joined but not begun the exam.',
        },
        {
          label: 'Working',
          value: examRows ? String(examCount('in_progress')) : '–',
          tip: 'Students with the exam open and their timer running.',
        },
        {
          label: 'Submitted',
          value: examRows ? `${submitted}/${examRows.length}` : '–',
          tip: 'Students who have handed in their exam.',
        },
        {
          label: 'Avg. score',
          value: examScores.length
            ? Math.round(
                examScores.reduce((sum, value) => sum + value, 0) / examScores.length,
              ).toLocaleString()
            : '–',
          tip: 'The average score of the exams handed in so far.',
        },
      ]
    : [
        {
          label: 'Students',
          value: `${connectedCount}/${room.participants.length}`,
          tip: 'Connected right now, out of everyone who has joined.',
        },
        room.adaptive && round
          ? {
              label: 'Round',
              value: `${round.roundNumber}/${round.totalRounds}`,
              tip: 'How far through the adaptive rounds the session is.',
            }
          : {
              label: 'Question',
              value: question ? `${question.questionNumber}/${question.totalQuestions}` : '–',
              tip: 'How far through the questions the session is.',
            },
        {
          label: 'Answered now',
          value:
            room.status === 'running' && !room.questionClosed
              ? `${room.answeredCount ?? 0}/${room.participants.length}`
              : '–',
          tip: 'Students who have answered the question on screen.',
        },
        {
          label: 'Accuracy',
          value: answeredSum > 0 ? `${Math.round((correctSum / answeredSum) * 100)}%` : '–',
          tip: 'Correct answers out of all answers so far in this session.',
        },
        {
          label: 'Avg. time',
          value: times.length
            ? `${(times.reduce((sum, value) => sum + value, 0) / times.length / 1000).toFixed(1)}s`
            : '–',
          tip: 'How long students take to answer, on average.',
        },
      ];
  const kindLabel = isExam ? 'Timed exam' : room.adaptive ? 'Adaptive quiz' : 'Live quiz';
  const statusLabel =
    room.status === 'lobby' ? 'In the lobby' : room.status === 'ended' ? 'Ended' : 'In progress';

  const answered = room.answeredCount ?? 0;
  const live = room.status === 'running';
  const showLeaderboard = !isExam && live && room.leaderboard.length > 0;
  const lobby = room.status === 'lobby';
  const lobbyText =
    room.accessMode === 'token'
      ? 'This session is for invited students only. Add your students below and send each their token. The join code alone is not enough to get in.'
      : room.mode === 'exam'
        ? 'When everyone is in, open the exam. Each student starts their own timer after accepting the exam rules.'
        : 'Students scan the QR code or enter the join code. Start the quiz when everyone you expect is on the list.';

  return (
    <section className="flex flex-1 flex-col">
      <PageHeader
        back={{ to: '/host', label: 'Quizzes' }}
        title={room.quizTitle}
        description={
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  live
                    ? 'animate-live bg-accent-500'
                    : room.status === 'lobby'
                      ? 'bg-amber-500'
                      : 'bg-night/25'
                }`}
              />
              {statusLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span>{kindLabel}</span>
            <span aria-hidden="true">·</span>
            <span>
              {connectedCount} of {room.participants.length} connected
            </span>
          </p>
        }
        actions={
          room.status === 'ended' ? (
            <Link
              to={`/sessions/${sessionId}/summary`}
              className={`${ctaPrimary} ${ctaSize.md} self-start lg:self-auto`}
            >
              Open the full summary and exports
            </Link>
          ) : (
            <Button variant="danger" disabled={busy} onClick={() => setConfirmingEnd(true)}>
              End session
            </Button>
          )
        }
      >
        {message && (
          <AuthNotice tone="danger" className="mt-6">
            {message}
          </AuthNotice>
        )}
      </PageHeader>

      <section aria-label="Session figures" className={`border-b ${RULE} ${BLEED}`}>
        <Frame flush>
          <dl className="grid grid-cols-2 sm:grid-cols-5">
            {figures.map((figure, index) => (
              <div
                key={figure.label}
                className={`px-4 py-3 sm:px-5 ${RULE} ${index % 2 ? 'border-l' : ''} ${
                  index > 1 ? 'border-t sm:border-t-0' : ''
                } ${index > 0 ? 'sm:border-l' : ''}`}
              >
                <dt>
                  <Tooltip
                    label={figure.tip}
                    align={index === figures.length - 1 ? 'end' : 'start'}
                  >
                    <span
                      tabIndex={0}
                      className="cursor-help rounded text-xs text-night/55 decoration-night/25 decoration-dotted underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {figure.label}
                    </span>
                  </Tooltip>
                </dt>
                <dd className="mt-0.5 font-geist-mono text-xl font-medium tracking-tight tabular-nums">
                  {figure.value}
                </dd>
              </div>
            ))}
          </dl>
        </Frame>
      </section>

      <PageBody>
        <div className="grid items-start gap-4 px-4 pt-5 pb-8 sm:px-10 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-4">
            {room.status === 'lobby' && (
              <section aria-labelledby="lobby-heading" className={STAGE}>
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 id="lobby-heading" className="text-xl font-medium tracking-tight">
                      Waiting for students
                    </h2>
                    <p className="mt-1 max-w-xl text-sm leading-relaxed text-night/55">
                      {lobbyText}
                    </p>
                  </div>
                  <Button
                    variant="brand"
                    className="shrink-0 self-start"
                    disabled={busy || room.participants.length === 0}
                    onClick={() => setChoosingProctoring(true)}
                  >
                    {room.mode === 'exam' ? 'Open the exam' : 'Start quiz'}
                  </Button>
                </div>
                <div className={`border-t p-5 ${RULE}`}>
                  <StudentRoster
                    participants={room.participants}
                    size="large"
                    onLetBackIn={letBackIn}
                  />
                </div>
              </section>
            )}

            {isExam && room.status !== 'lobby' && (
              <section aria-labelledby="exam-heading" className={STAGE}>
                <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div>
                    <h2 id="exam-heading" className="text-xl font-medium tracking-tight">
                      {room.status === 'ended' ? 'Exam ended' : 'Exam in progress'}
                    </h2>
                    <p className="mt-0.5 text-sm text-night/55">
                      {submitted} of {examRows?.length ?? 0} handed in. Open a name for its
                      timeline.
                    </p>
                  </div>
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
                <div className={`space-y-4 border-t p-5 ${RULE}`}>
                  <ExamProgressTable
                    rows={examRows ?? []}
                    devicesById={devicesById}
                    proctored={room.proctored}
                    offsetMs={offsetMs}
                    selectedId={selectedStudentId}
                    onSelect={setSelectedStudentId}
                  />
                  {room.proctored && selectedRow && (
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
                </div>
              </section>
            )}

            {live && room.adaptive && round && (
              <section aria-labelledby="round-heading" className={STAGE}>
                <StageTop
                  label={`Round ${round.roundNumber} of ${round.totalRounds}`}
                  value={round.roundNumber}
                  total={round.totalRounds}
                  timer={
                    room.questionClosed ? (
                      <span className="text-sm text-night/55">Round closed</span>
                    ) : (
                      <InlineTimer
                        serverNowMs={serverNowMs}
                        startsAtServerMs={round.startsAtServerMs}
                        durationMs={round.durationMs}
                      />
                    )
                  }
                />
                <div className="px-5 pt-4 pb-4">
                  <h2 id="round-heading" className="text-xl font-medium tracking-tight">
                    Adaptive round
                  </h2>
                  <p className="mt-0.5 text-sm text-night/55">
                    Each student has their own question, matched to their rating.
                  </p>
                </div>
                <div className="max-h-80 overflow-y-auto px-5 pb-5">
                  <AdaptiveTable rows={room.adaptiveTable ?? []} />
                </div>
                <StageFoot
                  answered={answered}
                  total={room.participants.length}
                  closed={room.questionClosed}
                  action={
                    room.questionClosed && (
                      <Button
                        variant="brand"
                        disabled={busy}
                        onClick={() => void runCommand(() => api.nextQuestion(sessionId))}
                      >
                        {isLastRound ? 'Show final results' : 'Next round'}
                      </Button>
                    )
                  }
                />
              </section>
            )}

            {live && !room.adaptive && question && (
              <section aria-labelledby="question-heading" className={STAGE}>
                <StageTop
                  label={`Question ${question.questionNumber} of ${question.totalQuestions}`}
                  value={question.questionNumber}
                  total={question.totalQuestions}
                  timer={
                    room.questionClosed ? (
                      <span className="text-sm text-night/55">Answers closed</span>
                    ) : (
                      <InlineTimer
                        serverNowMs={serverNowMs}
                        startsAtServerMs={question.startsAtServerMs}
                        durationMs={question.durationMs}
                      />
                    )
                  }
                />
                <h2
                  id="question-heading"
                  className="px-5 pt-4 text-xl leading-snug font-medium tracking-tight break-words [overflow-wrap:anywhere]"
                >
                  {question.stem}
                </h2>
                <QuestionImage
                  imageUrl={question.imageUrl}
                  imageAlt={question.imageAlt}
                  className="mx-5 mt-3 max-h-48"
                />
                <ul className="grid gap-2 px-5 pt-4 pb-5 sm:grid-cols-2">
                  {question.options.map((option, optionIndex) => {
                    const optionCounts = room.lastResult?.optionCounts ?? null;
                    const count = optionCounts?.[optionIndex] ?? 0;
                    const total = optionCounts
                      ? Math.max(
                          optionCounts.reduce((sum, value) => sum + value, 0),
                          1,
                        )
                      : 1;
                    const share = Math.round((count / total) * 100);
                    const isCorrect = room.lastResult?.correctIndex === optionIndex;
                    return (
                      <li
                        key={OPTION_LETTERS[optionIndex]}
                        className={`relative min-w-0 overflow-hidden rounded-xl px-3 py-2.5 transition-[background-color,box-shadow] duration-300 ease-soft ${
                          isCorrect
                            ? 'bg-accent-50 shadow-[0_0_0_1.5px_var(--color-accent-500)]'
                            : 'bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.1)]'
                        }`}
                      >
                        {room.lastResult && (
                          <span
                            aria-hidden="true"
                            className={`absolute bottom-0 left-0 h-1 transition-[width] duration-500 ease-soft ${
                              isCorrect ? 'bg-accent-500' : 'bg-night/30'
                            }`}
                            style={{ width: `${share}%` }}
                          />
                        )}
                        <div className="relative flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-geist-mono text-[11px] font-medium ${
                              isCorrect
                                ? 'bg-accent-500 text-white'
                                : 'bg-night/[0.06] text-night/55'
                            }`}
                          >
                            {OPTION_LETTERS[optionIndex]}
                          </span>
                          <span className="min-w-0 flex-1 pt-px text-sm break-words [overflow-wrap:anywhere]">
                            <span className="sr-only">{OPTION_LETTERS[optionIndex]}. </span>
                            {option}
                            {isCorrect && (
                              <span className="ml-2 text-xs font-medium text-accent-700">
                                Correct
                              </span>
                            )}
                          </span>
                          {room.lastResult && (
                            <span className="shrink-0 pt-px text-right font-geist-mono text-xs tabular-nums">
                              <span className="font-medium text-night">{count}</span>
                              <span className="ml-1.5 text-night/45">{share}%</span>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <StageFoot
                  answered={answered}
                  total={room.participants.length}
                  closed={room.questionClosed}
                  action={
                    room.questionClosed && (
                      <Button
                        variant="brand"
                        disabled={busy}
                        onClick={() => void runCommand(() => api.nextQuestion(sessionId))}
                      >
                        {isLastQuestion ? 'Show final results' : 'Next question'}
                      </Button>
                    )
                  }
                />
              </section>
            )}

            {room.status === 'ended' && (
              <section aria-labelledby="final-heading" className={STAGE}>
                <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 id="final-heading" className="text-xl font-medium tracking-tight">
                      Final results
                    </h2>
                    <p className="mt-0.5 text-sm text-night/55">
                      The session has ended. Students can see their results.
                    </p>
                  </div>
                  <Link to="/host" className={`${ctaLight} ${ctaSize.md} self-start sm:self-auto`}>
                    Back to dashboard
                  </Link>
                </div>
                {(!isExam || room.adaptiveTable) && (
                  <div className={`space-y-4 border-t p-5 ${RULE}`}>
                    {!isExam && <Leaderboard entries={room.leaderboard} />}
                    {room.adaptiveTable && <AdaptiveTable rows={room.adaptiveTable} />}
                  </div>
                )}
              </section>
            )}

            {room.accessMode === 'token' && room.status !== 'ended' && (
              <RosterPanel
                sessionId={sessionId}
                joinCode={room.joinCode}
                refreshKey={rosterRefreshKey}
              />
            )}

            {room.proctored && !isExam && room.status !== 'lobby' && (
              <Panel
                title="Proctoring"
                description="Signals recorded from students' browsers. They are hints, not proof of misconduct."
              >
                <div className="space-y-4">
                  <LiveProctorPanel
                    participants={room.participants}
                    events={allProctorEvents}
                    selectedId={selectedStudentId}
                    onSelect={setSelectedStudentId}
                  />
                  {liveSelected && (
                    <ProctorTimeline
                      displayName={liveSelected.displayName}
                      attemptStartedAtMs={room.startedAtServerMs}
                      events={mergeProctorEvents(
                        loadedTimelines.find(
                          (timeline) => timeline.participantId === liveSelected.participantId,
                        )?.events ?? [],
                        liveProctor[liveSelected.participantId] ?? [],
                      )}
                      droppedEvents={0}
                      onClose={() => setSelectedStudentId(null)}
                    />
                  )}
                </div>
              </Panel>
            )}

            {!isExam && room.status !== 'lobby' && (
              <AnalyticsPanel snapshot={analytics} connected={connected} running={live} />
            )}
          </div>

          <aside aria-label="Join details" className="space-y-4 lg:sticky lg:top-6">
            {room.status !== 'ended' && (
              <div
                className="relative overflow-hidden rounded-2xl p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_16px_40px_-20px_rgba(17,16,20,0.55)]"
                style={{ backgroundColor: panelColor, color: panelText }}
              >
                {!branded && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
                  >
                    <Texture field="rise" color="var(--color-accent-400)" opacity={0.28} cell={3} />
                  </div>
                )}
                <div className={`relative ${branded ? '' : 'pb-4'}`}>
                  {hasBranding(room.branding) && (
                    <div className="mb-3 border-b border-current/20 pb-3">
                      <BrandMark
                        branding={room.branding}
                        tone={panelText === '#ffffff' ? 'dark' : 'light'}
                      />
                    </div>
                  )}
                  {lobby ? (
                    <div className="text-center">
                      <p className="text-xs opacity-70">Join code</p>
                      <p className="font-geist-mono text-[2.5rem] leading-tight font-medium tracking-[0.14em] whitespace-nowrap tabular-nums">
                        {room.joinCode}
                      </p>
                      <div className="mx-auto mt-3 w-44 overflow-hidden rounded-xl bg-white p-1">
                        <JoinQrZoom url={joinUrl} code={room.joinCode} />
                      </div>
                      <p className="mt-3 text-xs opacity-70">Scan, or open</p>
                      <p className="text-sm font-medium break-all select-all">
                        {joinUrl.replace(/^https?:\/\//, '')}
                      </p>
                      <div className="mt-3">
                        <CopyButton
                          text={joinUrl}
                          label="Copy link"
                          variant={panelText === '#ffffff' ? 'accent' : 'primary'}
                          size="sm"
                          statusClassName="min-h-4 text-xs opacity-85"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-4">
                        <div className="hidden w-[5.5rem] shrink-0 overflow-hidden rounded-lg bg-white p-0.5 lg:block">
                          <JoinQrZoom url={joinUrl} code={room.joinCode} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs opacity-70">Join code</p>
                          <p className="font-geist-mono text-[1.75rem] leading-tight font-medium tracking-[0.12em] whitespace-nowrap tabular-nums">
                            {room.joinCode}
                          </p>
                          <p className="mt-1 truncate text-xs opacity-70" title={joinUrl}>
                            {joinUrl.replace(/^https?:\/\//, '')}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <CopyButton
                          text={joinUrl}
                          label="Copy link"
                          variant={panelText === '#ffffff' ? 'accent' : 'primary'}
                          size="sm"
                          statusClassName="min-h-4 text-xs opacity-85"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {showLeaderboard && (
              <Panel title="Leaderboard">
                <div className="max-h-80 overflow-y-auto">
                  <Leaderboard entries={room.leaderboard} />
                </div>
              </Panel>
            )}

            {room.status !== 'lobby' && (
              <StudentRoster participants={room.participants} onLetBackIn={letBackIn} />
            )}
          </aside>
        </div>
      </PageBody>

      {choosingProctoring && (
        <ProctoringChoiceDialog
          kind={isExam ? 'exam' : 'live'}
          busy={busy}
          initial={savedProctoring}
          onCancel={() => setChoosingProctoring(false)}
          onChoose={(choice) => {
            setChoosingProctoring(false);
            void runCommand(() => api.startSession(sessionId, choice));
          }}
        />
      )}

      {confirmingEnd && (
        <ConfirmDialog
          title="End this session now?"
          confirmLabel="End session"
          cancelLabel="Keep running"
          busy={busy}
          onCancel={() => setConfirmingEnd(false)}
          onConfirm={() => {
            setConfirmingEnd(false);
            void runCommand(() => api.endSession(sessionId));
          }}
        >
          <p>Students will see their final results and nobody can answer any more.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

// The main card of the console: one surface for whatever is happening now, split by dashed rules.
const STAGE =
  'overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_1px_3px_rgba(17,16,20,0.05)]';

// The top of the stage: where the session is, the time left, and a rule that fills as it goes.
function StageTop({
  label,
  value,
  total,
  timer,
}: {
  label: string;
  value: number;
  total: number;
  timer: ReactNode;
}) {
  return (
    <div>
      <div className="flex min-h-12 items-center justify-between gap-4 px-5 py-2.5">
        <p className="font-geist-mono text-xs text-night/50">{label}</p>
        {timer}
      </div>
      <div aria-hidden="true" className="h-px bg-night/[0.07]">
        <div
          className="h-full bg-night/60 transition-[width] duration-500 ease-soft"
          style={{ width: `${Math.min(value / Math.max(total, 1), 1) * 100}%` }}
        />
      </div>
    </div>
  );
}

// The bottom of the stage: how many have answered, and the next step once answers close.
function StageFoot({
  answered,
  total,
  closed,
  action,
}: {
  answered: number;
  total: number;
  closed: boolean;
  action: ReactNode;
}) {
  const share = total ? Math.min(answered / total, 1) : 0;
  return (
    <div
      className={`flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-t bg-night/[0.015] px-5 py-2.5 ${RULE}`}
    >
      {closed ? (
        <p className="flex-1 text-sm text-night/60">
          Answers are closed. The results are shown above.
        </p>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <p className="shrink-0 text-sm font-medium tabular-nums">
            {answered} of {total} answered
          </p>
          <div
            aria-hidden="true"
            className="relative h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-night/[0.06]"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-night/70 transition-[width] duration-500 ease-soft"
              style={{ width: `${share * 100}%` }}
            />
          </div>
        </div>
      )}
      {action}
    </div>
  );
}
