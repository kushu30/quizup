import { EXAM_CONSENT_MEDIA_TEXT, EXAM_CONSENT_TEXT, proctorLimitSentence } from '@quizup/shared';
import { ctaLight, ctaPrimary, ctaSize } from '../landing/cta';
import { CARD, PlayStage } from '../play/PlayStage';
import { Notice } from '../ui';

interface ExamConsentProps {
  durationMinutes: number;
  proctored: boolean;
  /** Which devices the host turned on, and the auto-submit limit, if any. */
  camera?: boolean;
  mic?: boolean;
  flagLimit?: number | null;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
}

function Section({ heading, items }: { heading: string; items: readonly string[] }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-sm font-medium">{heading}</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-[0.9375rem] leading-relaxed">
            <span
              aria-hidden="true"
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-night/30"
            />
            <span className="text-night/75">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ExamConsent({
  durationMinutes,
  proctored,
  camera = false,
  mic = false,
  flagLimit = null,
  busy,
  error,
  onAccept,
  onDecline,
}: ExamConsentProps) {
  const anyDevice = camera || mic;
  const monitored = [
    ...EXAM_CONSENT_TEXT.monitored,
    ...(camera ? EXAM_CONSENT_MEDIA_TEXT.camera : []),
    ...(mic ? EXAM_CONSENT_MEDIA_TEXT.mic : []),
  ];
  const notCollected = [
    ...EXAM_CONSENT_TEXT.notCollected.filter(
      (item) => !(camera && item === 'No webcam') && !(mic && item === 'No microphone'),
    ),
    ...(anyDevice ? EXAM_CONSENT_MEDIA_TEXT.notRecorded : []),
  ];
  const statements = [
    ...EXAM_CONSENT_TEXT.statements,
    ...(flagLimit !== null ? [proctorLimitSentence(flagLimit)] : []),
  ];
  return (
    <PlayStage width="lg">
      <div className={`${CARD} space-y-6 p-6 sm:p-8`}>
        <div className="space-y-2">
          <h1 className="text-[1.875rem] leading-tight font-medium tracking-[-0.03em]">
            {EXAM_CONSENT_TEXT.title}
          </h1>
          <p className="text-night/60">
            You have <strong className="font-medium text-night">{durationMinutes} minutes</strong>.
            The timer starts when you accept.
          </p>
        </div>
        {proctored ? (
          <>
            <div className="grid gap-6 sm:grid-cols-2">
              <Section heading={EXAM_CONSENT_TEXT.monitoredHeading} items={monitored} />
              <Section heading={EXAM_CONSENT_TEXT.notCollectedHeading} items={notCollected} />
            </div>
            <div className="border-t border-dashed border-night/15 pt-5">
              <Section heading={EXAM_CONSENT_TEXT.statementsHeading} items={statements} />
            </div>
          </>
        ) : (
          <div className="border-t border-dashed border-night/15 pt-5">
            <Section
              heading="This exam is not proctored"
              items={['Nothing about your browsing is recorded.']}
            />
          </div>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <button
            type="button"
            disabled={busy}
            onClick={onAccept}
            className={`${ctaPrimary} ${ctaSize.lg} sm:flex-1`}
          >
            {EXAM_CONSENT_TEXT.acceptLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDecline}
            className={`${ctaLight} ${ctaSize.lg}`}
          >
            {EXAM_CONSENT_TEXT.declineLabel}
          </button>
        </div>
      </div>
    </PlayStage>
  );
}
