import {
  PROCTOR_COUNTED_TYPES,
  PROCTOR_TYPE_LABELS,
  describeDevice,
  type ParticipantAnalytics,
  type ProctorParticipantTimeline,
  type StudentResult,
} from '@quizup/shared';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { StudentResultView } from '../components/StudentResultView';
import { PageBody, PageHeader } from '../components/app/Page';
import { Notice, PageLoader, Panel, TableFrame } from '../components/ui';
import { api, describeError } from '../lib/api';
import { formatDuration } from '../lib/formatDuration';

function Proctoring({
  participant,
  timeline,
}: {
  participant: ParticipantAnalytics;
  timeline: ProctorParticipantTimeline | null;
}) {
  const counts = participant.proctorCounts;
  if (!counts) {
    return null;
  }
  const events = (timeline?.events ?? []).filter((event) => event.type !== 'consent_given');
  return (
    <Panel
      title="Proctoring"
      description="Signals recorded in the student's browser with their consent. They are indicators to review, not proof of misconduct."
    >
      <div className="space-y-4">
        <TableFrame label="Proctor signal counts">
          <table aria-label="Proctor signal counts">
            <thead>
              <tr>
                {PROCTOR_COUNTED_TYPES.map((type) => (
                  <th key={type} scope="col" className="text-right">
                    {PROCTOR_TYPE_LABELS[type]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {PROCTOR_COUNTED_TYPES.map((type) => (
                  <td key={type} className="text-right tabular-nums">
                    {counts[type]}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </TableFrame>
        {events.length === 0 ? (
          <p className="text-sm text-muted">No signals were recorded.</p>
        ) : (
          <ol aria-label="Proctor timeline" className="space-y-1 text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap gap-x-3">
                <span className="w-20 shrink-0 text-muted tabular-nums">
                  {timeline?.attemptStartedAtMs
                    ? `+${formatDuration(Math.max(event.serverAt - timeline.attemptStartedAtMs, 0))}`
                    : new Date(event.serverAt).toLocaleTimeString()}
                </span>
                <span>
                  {PROCTOR_TYPE_LABELS[event.type as keyof typeof PROCTOR_TYPE_LABELS] ??
                    event.type}
                </span>
                {event.late && <span className="text-muted">(delivered late)</span>}
              </li>
            ))}
          </ol>
        )}
        {timeline && timeline.droppedEvents > 0 && (
          <p className="text-sm text-muted">
            {timeline.droppedEvents} signals were dropped by the rate cap.
          </p>
        )}
      </div>
    </Panel>
  );
}

export function StudentResultPage() {
  const { sessionId = '', participantId = '' } = useParams();
  const [result, setResult] = useState<StudentResult | null>(null);
  const [participant, setParticipant] = useState<ParticipantAnalytics | null>(null);
  const [timeline, setTimeline] = useState<ProctorParticipantTimeline | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getStudentResult(sessionId, participantId)
      .then((loaded) => {
        if (!cancelled) {
          setResult(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(describeError(error));
        }
      });
    api
      .getSessionSummary(sessionId)
      .then((summary) => {
        if (!cancelled) {
          setParticipant(
            summary.participants.find((entry) => entry.participantId === participantId) ?? null,
          );
        }
      })
      .catch(() => undefined);
    api
      .getProctorTimeline(sessionId)
      .then((timelines) => {
        if (!cancelled) {
          setTimeline(timelines.find((entry) => entry.participantId === participantId) ?? null);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId, participantId]);

  const autoEvent = timeline?.events.find((event) => event.type === 'auto_submitted');
  const autoSubmit = autoEvent
    ? {
        count: Number(autoEvent.detail?.count ?? 0),
        limit: Number(autoEvent.detail?.limit ?? 0),
      }
    : null;

  return (
    <section className="flex flex-1 flex-col">
      <PageHeader
        title={result?.displayName ?? 'Student result'}
        description={
          result
            ? `${result.quizTitle}, ${result.mode === 'exam' ? 'timed exam' : 'live quiz'}`
            : undefined
        }
        back={{ to: `/sessions/${sessionId}/summary`, label: 'Session summary' }}
      />
      <PageBody>
        <div className="space-y-6 px-4 pt-6 pb-10 sm:px-10">
          {message && <Notice tone="danger">{message}</Notice>}
          {autoSubmit && (
            <Notice tone="warning">
              Auto-submitted by proctoring after {autoSubmit.count} of {autoSubmit.limit} flags.
              Answers given up to that point were graded as usual. Review the timeline below before
              deciding anything.
            </Notice>
          )}
          {!result && !message && <PageLoader label="Loading the result" />}
          {result && <StudentResultView result={result} audience="host" />}
          {participant && (
            <>
              <Proctoring participant={participant} timeline={timeline} />
              <Panel title="Device">
                {participant.devices.length === 0 ? (
                  <p className="text-muted">No device recorded.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {participant.devices.map((device, index) => (
                      <li key={index}>{describeDevice(device)}</li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </div>
      </PageBody>
    </section>
  );
}
