import type { AssessmentType, Branding } from '@quizup/shared';
import { useState } from 'react';
import { readableTextOn } from '../lib/brandColor';
import { BrandMark } from './branding/BrandMark';
import { ctaLight, ctaPrimary, ctaSize, ctaSolid } from './landing/cta';
import { Texture } from './landing/Texture';
import { CARD, PlayStage } from './play/PlayStage';

const DEFAULT_COLOR = '#111014';

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
  const branded = Boolean(branding?.brandColor);
  const color = branding?.brandColor ?? DEFAULT_COLOR;
  const onColor = readableTextOn(color);
  const tone = onColor === '#ffffff' ? 'dark' : 'light';
  // An institution's own colour takes the main button; otherwise it is the usual green.
  const primary = branded ? ctaSolid : ctaPrimary;
  const primaryStyle = branded ? { backgroundColor: color, color: onColor } : undefined;

  return (
    <PlayStage width="md">
      <div className={`${CARD} overflow-hidden`}>
        <div
          className="relative overflow-hidden px-6 py-5 sm:px-8"
          style={{ backgroundColor: color, color: onColor }}
        >
          {!branded && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
            >
              <Texture field="rise" color="var(--color-accent-400)" opacity={0.3} cell={3} />
            </div>
          )}
          <div className="relative">
            <BrandMark branding={branding} size="lg" tone={tone} />
          </div>
        </div>

        <div className="space-y-6 px-6 py-7 sm:px-8">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="flex flex-1 gap-1.5">
              {(['welcome', 'instructions'] as const).map((name) => (
                <span
                  key={name}
                  className="h-1 flex-1 rounded-full transition-colors duration-300 ease-soft"
                  style={{
                    backgroundColor:
                      step === 'instructions' || name === 'welcome' ? color : 'rgba(17,16,20,0.1)',
                  }}
                />
              ))}
            </div>
            <p className="shrink-0 font-geist-mono text-xs text-night/50">
              Step {step === 'welcome' ? 1 : 2} of 2
            </p>
          </div>

          {step === 'welcome' ? (
            <>
              <div className="space-y-3">
                <span className="inline-block rounded-lg bg-night/[0.05] px-2.5 py-1 text-[0.8125rem] font-medium text-night/65">
                  {TYPE_LABELS[assessmentType]}
                </span>
                <h1 className="text-[1.875rem] leading-tight font-medium tracking-[-0.03em] break-words">
                  {quizTitle}
                </h1>
                <p className="text-lg">
                  Hi <span className="font-medium">{displayName}</span>, welcome.
                </p>
                {branding?.welcomeMessage && (
                  <p className="text-[1.0625rem] whitespace-pre-line text-night/60">
                    {branding.welcomeMessage}
                  </p>
                )}
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setStep('instructions')}
                className={`${primary} ${ctaSize.lg} w-full sm:w-auto`}
                style={primaryStyle}
              >
                Continue
              </button>
            </>
          ) : (
            <>
              <h1 className="text-[1.875rem] leading-tight font-medium tracking-[-0.03em]">
                Instructions
              </h1>
              {branding?.instructions && (
                <section
                  aria-labelledby="host-instructions"
                  className="space-y-2 rounded-xl bg-night/[0.03] p-4"
                >
                  <h2 id="host-instructions" className="text-sm font-medium">
                    From your host
                  </h2>
                  <p className="text-[0.9375rem] whitespace-pre-line text-night/80">
                    {branding.instructions}
                  </p>
                </section>
              )}
              <section aria-labelledby="how-it-works" className="space-y-3">
                <h2 id="how-it-works" className="text-sm font-medium">
                  How it works
                </h2>
                <ul className="space-y-2.5">
                  {rulesFor(assessmentType, durationMinutes).map((rule) => (
                    <li key={rule} className="flex gap-3 text-[0.9375rem] leading-relaxed">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-night/30"
                      />
                      <span className="text-night/75">{rule}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={() => setStep('welcome')}
                  className={`${ctaLight} ${ctaSize.lg}`}
                >
                  Back
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={onDone}
                  className={`${primary} ${ctaSize.lg}`}
                  style={primaryStyle}
                >
                  I&apos;m ready
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </PlayStage>
  );
}
