import type { AssessmentType, Branding } from '@quizup/shared';
import { useState } from 'react';
import { readableTextOn } from '../lib/brandColor';
import { BrandMark } from './branding/BrandMark';
import { buttonClasses } from './ui';

const DEFAULT_COLOR = '#1e5446';

const TYPE_LABELS: Record<AssessmentType, string> = {
  live: 'Live quiz',
  adaptive: 'Adaptive quiz',
  exam: 'Timed exam',
};

const PROCTORING_RULE =
  'If your host turns on proctoring, you are told before you begin. Switching tabs, copying and pasting and similar actions are then recorded and shown to your host.';

function rulesFor(type: AssessmentType, durationMinutes?: number): string[] {
  if (type === 'exam') {
    return [
      `You have ${durationMinutes ?? 'a set number of'} minutes once you start. The timer keeps running if you leave.`,
      PROCTORING_RULE,
      'Move between questions and change answers freely until you submit.',
      'Your results appear when your host releases them, not straight away.',
    ];
  }
  const rules = [
    'Each question has a timer. Answer before it runs out; your answer locks when you tap it.',
    'Faster correct answers earn more points.',
    'If the page reloads, you pick up where you left off.',
    PROCTORING_RULE,
  ];
  if (type === 'adaptive') {
    rules.unshift(
      'Questions adapt to how you are doing, so classmates may see different questions at the same time.',
    );
  }
  return rules;
}

interface StudentIntroProps {
  quizTitle: string;
  displayName: string;
  branding: Branding | null;
  assessmentType: AssessmentType;
  durationMinutes?: number;
  onDone: () => void;
}

export function StudentIntro({
  quizTitle,
  displayName,
  branding,
  assessmentType,
  durationMinutes,
  onDone,
}: StudentIntroProps) {
  const [step, setStep] = useState<'welcome' | 'instructions'>('welcome');
  const color = branding?.brandColor ?? DEFAULT_COLOR;
  const onColor = readableTextOn(color);
  const tone = onColor === '#ffffff' ? 'dark' : 'light';
  const primaryStyle = { backgroundColor: color, color: onColor };

  return (
    <div className="mx-auto max-w-xl overflow-hidden rounded-xl border border-rule bg-surface">
      <div className="px-6 py-5 sm:px-8" style={{ backgroundColor: color, color: onColor }}>
        <BrandMark branding={branding} size="lg" tone={tone} />
      </div>

      <div className="space-y-6 px-6 py-7 sm:px-8">
        <p className="text-sm font-medium text-muted">Step {step === 'welcome' ? 1 : 2} of 2</p>

        {step === 'welcome' ? (
          <>
            <div className="space-y-3">
              <span className="inline-block rounded-md bg-paper px-2 py-1 text-xs font-semibold text-muted">
                {TYPE_LABELS[assessmentType]}
              </span>
              <h1 className="text-title font-semibold tracking-tight break-words sm:text-hero">
                {quizTitle}
              </h1>
              <p className="text-lg">
                Hi <span className="font-semibold">{displayName}</span>, welcome.
              </p>
              {branding?.welcomeMessage && (
                <p className="text-lg whitespace-pre-line text-muted">{branding.welcomeMessage}</p>
              )}
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => setStep('instructions')}
              className={`${buttonClasses('primary', 'lg')} w-full hover:opacity-90 sm:w-auto`}
              style={primaryStyle}
            >
              Continue
            </button>
          </>
        ) : (
          <>
            <h1 className="text-title font-semibold tracking-tight">Instructions</h1>
            {branding?.instructions && (
              <section aria-labelledby="host-instructions" className="space-y-2">
                <h2 id="host-instructions" className="text-base font-semibold">
                  From your host
                </h2>
                <p className="whitespace-pre-line text-ink">{branding.instructions}</p>
              </section>
            )}
            <section aria-labelledby="how-it-works" className="space-y-2">
              <h2 id="how-it-works" className="text-base font-semibold">
                How it works
              </h2>
              <ul className="list-disc space-y-2 pl-5 marker:text-muted">
                {rulesFor(assessmentType, durationMinutes).map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </section>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setStep('welcome')}
                className={buttonClasses('secondary', 'lg')}
              >
                Back
              </button>
              <button
                type="button"
                autoFocus
                onClick={onDone}
                className={`${buttonClasses('primary', 'lg')} hover:opacity-90`}
                style={primaryStyle}
              >
                I&apos;m ready
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
