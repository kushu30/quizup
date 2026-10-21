import {
  PROCTOR_COUNTED_TYPES,
  PROCTOR_TYPE_LABELS,
  type AnalyticsSnapshot,
  type ExportType,
  hasBranding,
  splitStoredBranding,
  type Branding,
  type SessionFeedbackResponse,
} from '@quizup/shared';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { StudentDevice } from '../components/StudentDevice';
import { Leaderboard } from '../components/Leaderboard';
import { MasteryHeatmap } from '../components/analytics/MasteryHeatmap';
import { QuestionDifficultyTable } from '../components/analytics/QuestionDifficultyTable';
import { ResponseHistogram } from '../components/analytics/ResponseHistogram';
import { FeedbackSummary } from '../components/FeedbackSummary';
import { BLEED, PageBody, PageHeader } from '../components/app/Page';
import { AppIcon, ICONS } from '../components/app/icons';
import { AuthNotice } from '../components/landing/AuthField';
import { Frame, RULE } from '../components/landing/frame';
import { Institution } from '../components/quizMeta';
import { Button, Notice, PageLoader, Panel, TableFrame } from '../components/ui';
import { api, describeError } from '../lib/api';
import { saveBlob } from '../lib/download';

const EXPORT_LABELS: Record<ExportType, string> = {
  participants: 'Download participants CSV',
  responses: 'Download responses CSV',
};

export function SessionSummaryPage() {
  const { sessionId = '' } = useParams();
  const [summary, setSummary] = useState<AnalyticsSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ExportType | null>(null);
  const [feedback, setFeedback] = useState<SessionFeedbackResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSessionFeedback(sessionId)
      .then((loaded) => {
        if (!cancelled) {
          setFeedback(loaded);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const [brand, setBrand] = useState<{
    quizId: string;
    quizTitle: string;
    branding: Branding | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSession(sessionId)
      .then((session) => api.getQuiz(session.session.quiz_id))
      .then((quiz) => {
        if (!cancelled) {
          setBrand({
            quizId: quiz.id,
            quizTitle: quiz.title,
            branding: splitStoredBranding(quiz.settings).branding,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    api
      .getSessionSummary(sessionId)
      .then((loaded) => {
        if (!cancelled) {
          setSummary(loaded);
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
  }, [sessionId]);

  const heatmapRows = useMemo(
    () =>
      (summary?.participants ?? []).map((participant) => ({
        participantId: participant.participantId,
        displayName: participant.displayName,
        score: participant.score,
        mastery: participant.mastery,
      })),
    [summary?.participants],
  );

  async function handleDownload(type: ExportType) {
    setDownloading(type);
    setMessage(null);
    try {
      saveBlob(
        await api.downloadExport(sessionId, type),
        `quizup-${sessionId.slice(0, 8)}-${type}.csv`,
      );
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setDownloading(null);
    }
  }

  if (!summary) {
    return (
      <section className="flex flex-1 flex-col">
        <PageHeader title="Session summary" back={{ to: '/host', label: 'Quizzes' }}>
          {message && (
            <AuthNotice tone="danger" className="mt-6">
              {message}
            </AuthNotice>
          )}
        </PageHeader>
        <PageBody>{message ? null : <PageLoader label="Loading..." />}</PageBody>
      </section>
    );
  }

  const count = summary.participants.length;
  const scores = summary.participants.map((participant) => participant.score);
  const stats = [
    { label: 'Students', value: String(count) },
    { label: 'Questions', value: String(summary.questions.length) },
    {
      label: 'Average score',
      value: scores.length
        ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length).toLocaleString()
        : '–',
    },
    {
      label: 'Rating',
      value: feedback?.averageRating ? feedback.averageRating.toFixed(1) : '–',
    },
  ];
  const statusLabel = summary.status === 'ended' ? 'Ended' : 'Still running';

  return (
    <section className="flex flex-1 flex-col">
      <PageHeader
        title={brand?.quizTitle ?? 'Session summary'}
        back={
          brand?.quizId
            ? { to: `/host/quizzes/${brand.quizId}/history`, label: 'History' }
            : { to: '/host', label: 'Quizzes' }
        }
        description={
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Session summary</span>
            <span aria-hidden="true">·</span>
            <span>{statusLabel}</span>
            {summary.adaptive && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Adaptive, {summary.roundsCompleted} of {summary.totalRounds} rounds
                </span>
              </>
            )}
            {brand?.branding && hasBranding(brand.branding) && (
              <>
                <span aria-hidden="true">·</span>
                <Institution branding={brand.branding} />
              </>
            )}
          </p>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(['participants', 'responses'] as const).map((type) => (
              <Button
                key={type}
                variant="secondary"
                disabled={downloading !== null}
                onClick={() => void handleDownload(type)}
              >
                <AppIcon size={16}>{ICONS.download}</AppIcon>
                {downloading === type ? 'Preparing...' : EXPORT_LABELS[type]}
              </Button>
            ))}
          </div>
        }
      >
        {message && (
          <AuthNotice tone="danger" className="mt-6">
            {message}
          </AuthNotice>
        )}
      </PageHeader>

      <section aria-label="Overview" className={`border-b ${RULE} ${BLEED}`}>
        <Frame flush>
          <dl className="grid grid-cols-2 md:grid-cols-4">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={`px-4 py-5 sm:px-6 ${RULE} ${index % 2 ? 'border-l' : ''} ${
                  index > 1 ? 'border-t md:border-t-0' : ''
                } ${index === 2 ? 'md:border-l' : ''}`}
              >
                <dt className="text-sm text-night/55">{stat.label}</dt>
                <dd className="mt-1 font-geist-mono text-[1.625rem] font-medium tracking-tight text-night tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </Frame>
      </section>

      <PageBody>
        <div className="space-y-6 px-4 pt-8 sm:px-10">
          {summary.source === 'rebuilt' && (
            <Notice tone="warning">
              This summary was rebuilt from the saved responses. Time buckets use the slowest answer
              as the time limit.
            </Notice>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-2">
            <Panel title="Final leaderboard">
              <Leaderboard entries={summary.leaderboard} />
            </Panel>

            <Panel title="Response time">
              <ResponseHistogram
                currentCounts={summary.currentRoundHistogram}
                sessionCounts={summary.sessionHistogram}
                currentLabel="Last round"
              />
            </Panel>
          </div>

          <FeedbackSummary feedback={feedback} />

          <Panel title="Questions">
            <QuestionDifficultyTable questions={summary.questions} showMedian />
          </Panel>

          <Panel title="Mastery">
            <MasteryHeatmap topics={summary.topics} rows={heatmapRows} />
          </Panel>

          <Panel
            title="Where students joined from"
            description="The device each student used. Open a row for browser, system and screen."
          >
            <TableFrame label="Student devices table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Device</th>
                  </tr>
                </thead>
                <tbody>
                  {[...summary.participants]
                    .sort((first, second) => first.displayName.localeCompare(second.displayName))
                    .map((participant) => (
                      <tr key={participant.participantId}>
                        <td className="font-medium">{participant.displayName}</td>
                        <td>
                          <StudentDevice devices={participant.devices} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </TableFrame>
          </Panel>

          {summary.participants.some((participant) => participant.proctorCounts !== null) && (
            <Panel
              title="Proctor signals per student"
              description="These are indicators recorded with the student's consent, not proof of misconduct."
            >
              <TableFrame label="Proctor signals per student table">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col" className="text-right">
                        Score
                      </th>
                      {PROCTOR_COUNTED_TYPES.map((type) => (
                        <th key={type} scope="col" className="text-right">
                          {PROCTOR_TYPE_LABELS[type]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...summary.participants]
                      .sort((first, second) => first.displayName.localeCompare(second.displayName))
                      .map((participant) => (
                        <tr key={participant.participantId}>
                          <td className="font-medium">{participant.displayName}</td>
                          <td className="text-right tabular-nums">{participant.score}</td>
                          {PROCTOR_COUNTED_TYPES.map((type) => (
                            <td key={type} className="text-right tabular-nums">
                              {participant.proctorCounts?.[type] ?? 0}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </TableFrame>
            </Panel>
          )}
        </div>
      </PageBody>
    </section>
  );
}
