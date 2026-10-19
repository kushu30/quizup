import { EXAM_CONSENT_TEXT } from '@quizup/shared';

interface ExamConsentProps {
  durationMinutes: number;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
}

function Section({ heading, items }: { heading: string; items: readonly string[] }) {
  return (
    <section className="space-y-1">
      <h2 className="font-semibold">{heading}</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function ExamConsent({
  durationMinutes,
  busy,
  error,
  onAccept,
  onDecline,
}: ExamConsentProps) {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h1 className="text-2xl font-bold">{EXAM_CONSENT_TEXT.title}</h1>
      <p className="text-sm text-slate-600">
        You have {durationMinutes} minutes. The timer starts when you accept.
      </p>
      <Section heading={EXAM_CONSENT_TEXT.monitoredHeading} items={EXAM_CONSENT_TEXT.monitored} />
      <Section
        heading={EXAM_CONSENT_TEXT.notCollectedHeading}
        items={EXAM_CONSENT_TEXT.notCollected}
      />
      <Section heading={EXAM_CONSENT_TEXT.statementsHeading} items={EXAM_CONSENT_TEXT.statements} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="rounded-md bg-slate-900 px-4 py-3 text-lg text-white disabled:opacity-50"
        >
          {EXAM_CONSENT_TEXT.acceptLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDecline}
          className="rounded-md border border-slate-300 px-4 py-3 disabled:opacity-50"
        >
          {EXAM_CONSENT_TEXT.declineLabel}
        </button>
      </div>
    </div>
  );
}
