import { EXAM_CONSENT_TEXT } from '@quizup/shared';
import { Button, Notice } from '../ui';

interface ExamConsentProps {
  durationMinutes: number;
  proctored: boolean;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
}

function Section({ heading, items }: { heading: string; items: readonly string[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{heading}</h2>
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink marker:text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function ExamConsent({
  durationMinutes,
  proctored,
  busy,
  error,
  onAccept,
  onDecline,
}: ExamConsentProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-lg border border-rule bg-surface p-6 sm:p-8">
      <div className="space-y-2">
        <h1 className="text-title font-semibold tracking-tight">{EXAM_CONSENT_TEXT.title}</h1>
        <p className="text-muted">
          You have <strong className="font-semibold text-ink">{durationMinutes} minutes</strong>.
          The timer starts when you accept.
        </p>
      </div>
      {proctored ? (
        <>
          <div className="grid gap-6 sm:grid-cols-2">
            <Section
              heading={EXAM_CONSENT_TEXT.monitoredHeading}
              items={EXAM_CONSENT_TEXT.monitored}
            />
            <Section
              heading={EXAM_CONSENT_TEXT.notCollectedHeading}
              items={EXAM_CONSENT_TEXT.notCollected}
            />
          </div>
          <div className="border-t border-rule pt-5">
            <Section
              heading={EXAM_CONSENT_TEXT.statementsHeading}
              items={EXAM_CONSENT_TEXT.statements}
            />
          </div>
        </>
      ) : (
        <div className="border-t border-rule pt-5">
          <Section
            heading="This exam is not proctored"
            items={['Nothing about your browsing is recorded.']}
          />
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button variant="brand" size="lg" disabled={busy} onClick={onAccept} className="sm:flex-1">
          {EXAM_CONSENT_TEXT.acceptLabel}
        </Button>
        <Button variant="secondary" size="lg" disabled={busy} onClick={onDecline}>
          {EXAM_CONSENT_TEXT.declineLabel}
        </Button>
      </div>
    </div>
  );
}
