import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ctaLight, ctaPrimary, ctaSize } from '../components/landing/cta';
import {
  IconBrand,
  IconFeedback,
  IconHistory,
  IconProctor,
  IconReconnect,
  IconToken,
  PlainIcon,
} from '../components/landing/icons';
import { HeroDemo } from '../components/landing/HeroDemo';
import { Frame, RULE } from '../components/landing/frame';
import { scrollToSection } from '../components/landing/sections';
import { CodeShot, EditorShot, SummaryShot } from '../components/landing/Shots';
import { Texture } from '../components/landing/Texture';
import { Notice } from '../components/ui';
import { useAuth } from '../lib/AuthContext';
import { HOST_ACCESS_MAILTO } from '../lib/contact';

const FACTS = [
  { title: 'No student accounts', body: 'A code and a name is enough' },
  { title: 'Any device', body: 'Phones, tablets and laptops' },
  { title: 'Your questions', body: 'Write, import a CSV or draft with AI' },
  { title: 'Open source', body: 'Host it on your own servers' },
];

const MODES = [
  {
    title: 'Live quiz',
    headline: 'The whole room, on the same question.',
    body: 'Everyone answers the same question at the same time. Points reward speed, and the leaderboard moves as answers arrive.',
    points: [
      'Seconds per question from 5 to 120',
      'Answer counts update as they come in',
      'Timing and scoring decided by the server',
    ],
    visual: <LiveVisual />,
    backdrop: 'bg-gradient-to-br from-sky-100 to-sky-50',
    glow: '#38bdf8',
  },
  {
    title: 'Adaptive quiz',
    headline: 'Every student at the right level.',
    body: 'Each student gets questions matched to their level, so strong students are stretched and others are not lost.',
    points: [
      'Questions carry a difficulty rating',
      'Ratings settle as more students answer',
      'Easy, medium and hard in one pool',
    ],
    visual: <AdaptiveVisual />,
    backdrop: 'bg-gradient-to-br from-violet-100 to-violet-50',
    glow: '#a08cfa',
  },
  {
    title: 'Timed exam',
    headline: 'Quiet, timed and fair.',
    body: 'Students work alone against a timer. Results stay hidden until you release them.',
    points: [
      'Personal question and option order',
      'Auto-submits when time runs out',
      'Resumes after a refresh or restart',
    ],
    visual: <ExamVisual />,
    backdrop: 'bg-gradient-to-br from-night-soft to-night',
    glow: '#fbbf24',
  },
];

// Each step shows a product screenshot. Set `src` (an image in apps/web/public, for example
// '/landing/editor.png') to use a real one; until then `render` draws a small stand-in.
const STEPS: {
  title: string;
  body: string;
  shot: { src?: string; render?: ReactNode; alt: string; tint: string };
}[] = [
  {
    title: 'Build your questions',
    shot: { render: <EditorShot />, alt: 'The quiz editor', tint: 'bg-sky-50' },
    body: 'Write them, import a spreadsheet, or review AI drafts before anything reaches students.',
  },
  {
    title: 'Share the code',
    shot: {
      render: <CodeShot />,
      alt: 'The join code and QR code on the host screen',
      tint: 'bg-violet-50',
    },
    body: 'Show the six-letter code or QR code, or send the link to your class group.',
  },
  {
    title: 'Run it and follow up',
    shot: { render: <SummaryShot />, alt: 'The session summary', tint: 'bg-amber-50' },
    body: 'Watch answers come in, see who needs help, then open the summary, history and exports.',
  },
];

const INTEGRITY = [
  {
    icon: <IconToken />,
    title: 'Invited students only',
    body: 'Give each student a personal token so nobody can join under someone else’s name.',
  },
  {
    icon: <IconProctor />,
    title: 'Proctoring when you want it',
    body: 'Choose before you start whether to record tab switches and similar signals. Students are told first.',
  },
  {
    icon: <IconReconnect />,
    title: 'Nobody loses their place',
    body: 'If the connection drops, the timer keeps running and answers are sent once the student is back.',
  },
];

const CLASSROOM = [
  {
    icon: <IconBrand />,
    title: 'Your institution on every screen',
    body: 'Add your logo and colour. Students see your brand from the join link to the feedback form, with QuizUp quietly behind it.',
  },
  {
    icon: <IconFeedback />,
    title: 'Anonymous feedback',
    body: 'Students rate the session and leave a comment without their name attached.',
  },
  {
    icon: <IconHistory />,
    title: 'History and exports',
    body: 'Every session is kept with scores, response times and the device each student used. Download it as CSV.',
  },
];

export function Landing() {
  const { canHost, session } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      scrollToSection(location.hash.slice(1));
    }
  }, [location.hash]);
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [joinCode, setJoinCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setCodeError('Enter the code your host shows on screen.');
      return;
    }
    navigate(`/join/${encodeURIComponent(code)}`);
  }

  function hostLink(className: string) {
    return canHost ? (
      <Link to="/host" className={className}>
        Open your dashboard
      </Link>
    ) : !session ? (
      <Link to="/login" className={className}>
        Log in to host
      </Link>
    ) : (
      <a href={HOST_ACCESS_MAILTO} className={className}>
        Request host access
      </a>
    );
  }

  return (
    <div className="overflow-x-clip text-night">
      {notice && (
        <div className="mx-auto max-w-2xl px-4 pt-24">
          <Notice tone="warning">{notice}</Notice>
        </div>
      )}

      <section className="texture-weave">
        <Frame double className="pt-32 text-center sm:pt-44">
          <h1 className="mx-auto max-w-3xl text-[2.75rem] leading-[1.02] font-medium tracking-[-0.04em] text-balance sm:text-[4.5rem]">
            Live quizzes and timed exams, one code away.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-night/60 sm:text-xl">
            Students join from any phone or laptop, no account needed. You write the questions, run
            the session and see who needs help while it happens.
          </p>

          <form
            onSubmit={handleJoin}
            noValidate
            className="mx-auto mt-10 max-w-md"
            aria-label="Join a quiz"
          >
            <label htmlFor={inputId} className="sr-only">
              Join code
            </label>
            <div
              className={`flex items-center gap-2 rounded-[1.1rem] bg-white p-1.5 pl-5 transition-shadow duration-200 ease-soft ${
                codeError
                  ? 'shadow-[0_0_0_2px_var(--color-alert),0_12px_32px_-16px_rgba(17,16,20,0.25)]'
                  : 'shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_2px_4px_rgba(17,16,20,0.04),0_12px_32px_-16px_rgba(17,16,20,0.25)] focus-within:shadow-[0_0_0_2px_var(--color-accent-400),0_12px_32px_-16px_rgba(17,16,20,0.25)]'
              }`}
            >
              <input
                id={inputId}
                value={joinCode}
                onChange={(event) => {
                  setJoinCode(event.target.value);
                  setCodeError(null);
                }}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={codeError ? true : undefined}
                aria-describedby={codeError ? `${hintId} ${errorId}` : hintId}
                placeholder="Enter join code"
                className="h-11 min-w-0 flex-1 bg-transparent font-geist-mono text-lg font-medium tracking-[0.25em] text-night uppercase tabular-nums placeholder:font-geist placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-night/40 placeholder:normal-case focus:outline-none"
              />
              <button type="submit" className={`${ctaPrimary} ${ctaSize.lg}`}>
                Continue
                <Arrow />
              </button>
            </div>
            <p id={hintId} className="mt-3 text-sm text-night/50">
              Six letters and numbers, shown on your host&apos;s screen.
            </p>
            {codeError && (
              <p id={errorId} className="mt-1 text-sm font-medium text-alert">
                {codeError}
              </p>
            )}
          </form>

          <p className="mt-8 text-[0.9375rem] text-night/55">
            Running the session yourself?{' '}
            {hostLink(
              'font-medium text-night underline decoration-night/20 underline-offset-4 transition-colors hover:decoration-night',
            )}
          </p>
        </Frame>

        <Frame double className="pt-14 sm:pt-20">
          <div className="relative z-10">
            <HeroDemo />
          </div>
          <Ground color="#47a3ff" className="-mt-24 sm:-mt-32" />
        </Frame>
      </section>

      <section aria-label="At a glance" className={`border-y ${RULE}`}>
        <Frame flush>
          <ul className="grid grid-cols-2 md:grid-cols-4">
            {FACTS.map((fact, index) => (
              <li
                key={fact.title}
                className={`px-4 py-5 sm:px-6 ${RULE} ${index % 2 ? 'border-l' : ''} ${
                  index > 1 ? 'border-t md:border-t-0' : ''
                } ${index === 2 ? 'md:border-l' : ''}`}
              >
                <p className="text-sm font-medium">{fact.title}</p>
                <p className="mt-0.5 text-sm text-night/50">{fact.body}</p>
              </li>
            ))}
          </ul>
        </Frame>
      </section>

      <section id="modes" aria-labelledby="modes-heading" className="scroll-mt-24 bg-white">
        <Frame className={SECTION_TOP}>
          <SectionIntro
            id="modes-heading"
            title="Three ways to run an assessment."
            body="Pick the one that fits the moment. Switching later is one setting."
          />
          <div className={`${INTRO_GAP} -mx-4 sm:-mx-10`}>
            {MODES.map((mode, index) => (
              <article
                key={mode.title}
                className={`grid items-center gap-10 border-t px-4 py-14 sm:px-10 sm:py-20 lg:grid-cols-2 lg:gap-20 ${RULE}`}
              >
                <div className={index % 2 ? 'lg:order-2' : ''}>
                  <h3 className="text-[1.875rem] leading-[1.1] font-medium tracking-[-0.03em] sm:text-[2.25rem]">
                    {mode.title}
                  </h3>
                  <p className="mt-4 max-w-md text-[1.0625rem] leading-relaxed text-night/60">
                    <span className="font-medium text-night">{mode.headline}</span> {mode.body}
                  </p>
                  <ul className="mt-8 flex flex-wrap gap-2">
                    {mode.points.map((point) => (
                      <li
                        key={point}
                        className="rounded-lg bg-night/[0.04] px-3 py-1.5 text-sm text-night/70 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.05)]"
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <div
                  aria-hidden="true"
                  className={`relative flex min-h-[22rem] items-center justify-center overflow-hidden rounded-2xl p-6 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.06)] sm:p-10 ${mode.backdrop}`}
                >
                  <Texture field="glow" color={mode.glow} opacity={0.5} />
                  <div className="relative w-full max-w-sm">{mode.visual}</div>
                </div>
              </article>
            ))}
          </div>
        </Frame>
      </section>

      <section
        id="exams"
        aria-labelledby="integrity-heading"
        className="scroll-mt-24 bg-night text-white"
      >
        <Frame tone="night" className={SECTION_TOP}>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
            <div>
              <SectionIntro
                id="integrity-heading"
                title="Built for assessments that count."
                body="When the grade matters, you decide who gets in, what is recorded and what happens when a connection drops."
                dark
                stacked
              />
              <ul className={`${INTRO_GAP} space-y-8`}>
                {INTEGRITY.map((item) => (
                  <li key={item.title} className="flex gap-4">
                    <PlainIcon className="mt-0.5 text-white/35">{item.icon}</PlainIcon>
                    <div className="min-w-0">
                      <h3 className="text-lg font-medium tracking-tight">{item.title}</h3>
                      <p className="mt-1.5 max-w-md leading-relaxed text-white/60">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <ProctorTimeline />
          </div>
          <Ground tone="night" color="#7d64f0" className={GROUND_GAP} />
        </Frame>
      </section>

      <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-24">
        <Frame className={`${SECTION_TOP} ${SECTION_BOTTOM}`}>
          <SectionIntro id="how-heading" title="From first question to final report." />
          <ol aria-label="How it works" className={`${INTRO_GAP} grid gap-3 lg:grid-cols-3`}>
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className={`rounded-2xl bg-white p-2 shadow-[0_0_0_1px_rgba(17,16,20,0.07),0_1px_2px_rgba(17,16,20,0.04)] ${
                  index === 0 ? 'lg:col-span-2' : index === 2 ? 'lg:col-span-3' : ''
                }`}
              >
                <div className={index === 2 ? 'grid gap-2 lg:grid-cols-2' : 'flex flex-col'}>
                  <div
                    className={`flex flex-col justify-center px-4 pt-5 pb-4 sm:px-5 ${
                      index === 2 ? 'order-2 lg:order-none' : 'order-2'
                    }`}
                  >
                    <h3 className="text-lg font-medium tracking-tight">{step.title}</h3>
                    <p className="mt-2 max-w-md leading-relaxed text-night/60">{step.body}</p>
                  </div>
                  <Shot
                    shot={step.shot}
                    className={index === 2 ? 'h-64 lg:h-72' : 'h-56 sm:h-64'}
                  />
                </div>
              </li>
            ))}
          </ol>
        </Frame>
      </section>

      <section
        id="classroom"
        aria-labelledby="features-heading"
        className={`scroll-mt-24 border-t ${RULE}`}
      >
        <Frame className={`${SECTION_TOP} ${SECTION_BOTTOM}`}>
          <SectionIntro
            id="features-heading"
            title="Made for real classrooms."
            body="The details that matter after the last question, and before the next class."
          />
          <div className={`${INTRO_GAP} grid md:grid-cols-3`}>
            {CLASSROOM.map((feature, index) => (
              <div
                key={feature.title}
                className={`relative py-8 md:px-10 md:first:pl-0 md:last:pr-0 ${index ? FADING_DIVIDER : ''}`}
              >
                <PlainIcon className="text-night/30">{feature.icon}</PlainIcon>
                <h3 className="mt-5 text-[1.1875rem] font-medium tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-2 leading-relaxed text-night/55">{feature.body}</p>
              </div>
            ))}
          </div>
        </Frame>
      </section>

      <section aria-labelledby="cta-heading" className={`border-t ${RULE}`}>
        <Frame className={`${SECTION_TOP} text-center`}>
          <div className="mx-auto max-w-xl">
            <h2
              id="cta-heading"
              className="text-[2.25rem] leading-[1.08] font-medium tracking-[-0.035em] text-balance sm:text-[3.25rem]"
            >
              Ready for your next class?
            </h2>
            <p className="mt-4 text-lg text-night/60">
              Students need only a code. You need only a few minutes to set it up.
            </p>
          </div>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link to="/join" className={`${ctaPrimary} ${ctaSize.lg}`}>
              Join a quiz
              <Arrow />
            </Link>
            {hostLink(`${ctaLight} ${ctaSize.lg}`)}
          </div>
          <Ground color="var(--color-accent-400)" className={GROUND_GAP} />
        </Frame>
      </section>
    </div>
  );
}

// One spacing scale for every section, so edges and gaps line up.
const SECTION_TOP = 'pt-24 sm:pt-32';
const INTRO_GAP = 'mt-14 sm:mt-16';
const GROUND_GAP = 'mt-20 sm:mt-24';
const SECTION_BOTTOM = 'pb-24 sm:pb-32';

// A hairline that fades out at both ends: across the top on phones, down the side on wider screens.
const FADING_DIVIDER =
  'before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-night/12 before:to-transparent md:before:inset-x-auto md:before:inset-y-0 md:before:left-0 md:before:h-auto md:before:w-px md:before:bg-gradient-to-b';

// The dither ground: a band that always sits flush on a section's bottom edge, between the
// rails. It is the only place the dither appears outside a product panel.
function Ground({
  tone = 'canvas',
  color,
  className = '',
}: {
  tone?: 'canvas' | 'night';
  color: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative -mx-4 h-32 sm:-mx-10 sm:h-40 ${className}`}
    >
      <Texture field="rise" color={color} opacity={tone === 'night' ? 0.55 : 0.6} />
    </div>
  );
}

function SectionIntro({
  id,
  title,
  body,
  dark = false,
  stacked = false,
}: {
  id: string;
  title: string;
  body?: string;
  dark?: boolean;
  stacked?: boolean;
}) {
  return (
    <div
      className={`grid content-start gap-5 ${stacked ? 'max-w-2xl' : 'lg:grid-cols-2 lg:items-end lg:gap-20'}`}
    >
      <h2
        id={id}
        className="max-w-xl text-[2.25rem] leading-[1.06] font-medium tracking-[-0.035em] text-balance sm:text-[3rem]"
      >
        {title}
      </h2>
      {body && (
        <p
          className={`max-w-lg text-lg leading-relaxed ${dark ? 'text-white/60' : 'text-night/60'}`}
        >
          {body}
        </p>
      )}
    </div>
  );
}

function Shot({
  shot,
  className,
}: {
  shot: { src?: string; render?: ReactNode; alt: string; tint: string };
  className: string;
}) {
  return shot.src ? (
    <img
      src={shot.src}
      alt={shot.alt}
      className={`w-full rounded-xl object-cover object-top shadow-[0_0_0_1px_rgba(17,16,20,0.06)] ${className}`}
    />
  ) : (
    <div
      role="img"
      aria-label={shot.alt}
      className={`w-full overflow-hidden rounded-xl bg-[radial-gradient(rgba(17,16,20,0.09)_1px,transparent_1px)] [background-size:14px_14px] px-4 pt-6 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.05)] sm:px-8 ${shot.tint} ${className}`}
    >
      <div aria-hidden="true" className="mx-auto max-w-xl">
        {shot.render}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8h10m0 0L9 4m4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VisualCard({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgba(17,16,20,0.05),0_1px_2px_rgba(17,16,20,0.05),0_20px_50px_-24px_rgba(17,16,20,0.3)]">
      {children}
    </div>
  );
}

function CardHeader({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[0.8125rem] text-night/50">
      <span>{left}</span>
      {right}
    </div>
  );
}

function LiveVisual() {
  const bars = [
    { letter: 'A', tone: 'bg-answer-a', width: '72%', count: 18 },
    { letter: 'B', tone: 'bg-answer-b', width: '16%', count: 4 },
    { letter: 'C', tone: 'bg-answer-c', width: '8%', count: 2 },
    { letter: 'D', tone: 'bg-answer-d', width: '4%', count: 1 },
  ];
  return (
    <VisualCard>
      <CardHeader
        left="Question 4 of 10"
        right={
          <span className="rounded-md bg-night px-2 py-0.5 font-geist-mono text-xs text-white">
            0:12
          </span>
        }
      />
      <p className="mt-4 text-[0.9375rem] font-medium tracking-tight">25 of 28 answered</p>
      <ul className="mt-4 space-y-2.5">
        {bars.map((bar) => (
          <li key={bar.letter} className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-geist-mono text-[11px] font-medium ${bar.tone} ${
                bar.letter === 'C' ? 'text-night' : 'text-white'
              }`}
            >
              {bar.letter}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-night/[0.06]">
              <span
                className={`block h-full rounded-full ${bar.tone}`}
                style={{ width: bar.width }}
              />
            </span>
            <span className="w-5 text-right font-geist-mono text-xs text-night/50 tabular-nums">
              {bar.count}
            </span>
          </li>
        ))}
      </ul>
    </VisualCard>
  );
}

function AdaptiveVisual() {
  const path = [
    { label: 'Medium', rating: 1000, correct: true },
    { label: 'Hard', rating: 1200, correct: false },
    { label: 'Medium', rating: 1040, correct: true },
    { label: 'Hard', rating: 1180, correct: true },
  ];
  return (
    <VisualCard>
      <CardHeader
        left="Asha, question 5"
        right={<span className="font-medium text-violet-600">Next: hard</span>}
      />
      <ol className="mt-4 space-y-2">
        {path.map((step, index) => (
          <li
            key={index}
            className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-sm"
            style={{ marginLeft: `${Math.round((step.rating - 1000) / 12)}px` }}
          >
            <span className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${step.correct ? 'bg-success' : 'bg-alert'}`}
              />
              {step.label}
            </span>
            <span className="font-geist-mono text-xs text-night/50 tabular-nums">
              {step.rating.toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </VisualCard>
  );
}

function ExamVisual() {
  return (
    <VisualCard>
      <CardHeader left="Midterm, section B" right={<span>12 of 30</span>} />
      <p className="mt-5 font-geist-mono text-[2.75rem] leading-none font-light tracking-tight tabular-nums">
        42:18
      </p>
      <p className="mt-1 text-sm text-night/55">Time remaining</p>
      <span className="mt-5 block h-1.5 overflow-hidden rounded-full bg-night/[0.06]">
        <span className="block h-full w-2/5 rounded-full bg-night" />
      </span>
      <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-canvas px-3 py-1.5 text-xs font-medium text-night/70">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect
            x="2"
            y="5.5"
            width="8"
            height="5"
            rx="1.2"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path d="M4 5.5V4a2 2 0 1 1 4 0v1.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        Results hidden until you release them
      </p>
    </VisualCard>
  );
}

const EXAM_MINUTES = 45;

const SIGNALS = [
  {
    time: '10:02:14',
    minute: 2.2,
    name: 'consent_given',
    label: 'Accepted the exam notice',
    tone: 'bg-success',
    icon: 'M3.5 8.5 6.5 11.5 12.5 5',
  },
  {
    time: '10:17:41',
    minute: 17.7,
    name: 'tab_switch',
    label: 'Switched to another tab',
    tone: 'bg-answer-c',
    icon: 'M2.5 5.5h4l1-2h6v9h-11Z',
  },
  {
    time: '10:17:52',
    minute: 17.9,
    name: 'focus_return',
    label: 'Came back after 11 s',
    tone: 'bg-violet-400',
    icon: 'M6 4 3 7l3 3M3.5 7h6a3.5 3.5 0 0 1 0 7H7',
  },
  {
    time: '10:24:18',
    minute: 24.3,
    name: 'paste',
    label: 'Pasted 42 characters',
    tone: 'bg-answer-b',
    icon: 'M5.5 3h5v2h-5ZM4.5 4h-1v9.5h9V4h-1',
  },
  {
    time: '10:31:09',
    minute: 31.1,
    name: 'fullscreen_exit',
    label: 'Left full screen',
    tone: 'bg-answer-a',
    icon: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10',
  },
];

// A host's view of one student's exam: an exam-length track with a tick per signal, and the
// signals themselves. Rows come in one by one when the card scrolls into view, and hovering a
// row picks out its tick.
function ProctorTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (shown || !node) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="relative self-center overflow-hidden rounded-2xl bg-night-soft/90 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_30px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20 text-sm font-medium text-violet-200 shadow-[0_0_0_1px_rgba(160,140,250,0.3)]">
          A
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-medium text-white">Asha</p>
          <p className="text-[0.8125rem] text-white/45">Midterm, section B · question 12 of 30</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/70">
          <span className="h-1.5 w-1.5 animate-live rounded-full bg-accent-300" />
          In progress
        </span>
      </div>

      <div className="px-5 pt-5">
        <div className="flex justify-between text-[0.75rem] text-white/40">
          <span>Start</span>
          <span>{EXAM_MINUTES} min</span>
        </div>
        <div className="relative mt-2 h-7">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
          <span
            className="absolute top-1/2 left-0 h-px -translate-y-1/2 bg-gradient-to-r from-violet-500/0 to-violet-400 transition-[width] duration-1000 ease-out"
            style={{ width: shown ? '73%' : '0%' }}
          />
          <span
            className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-violet-300 transition-[left] duration-1000 ease-out"
            style={{ left: shown ? '73%' : '0%' }}
          />
          {SIGNALS.map((signal, index) => (
            <span
              key={signal.name}
              className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[3px] transition-transform duration-200 ${signal.tone} ${
                active === index ? 'scale-[1.8] ring-2 ring-night-soft' : ''
              }`}
              style={{ left: `${(signal.minute / EXAM_MINUTES) * 100}%` }}
            />
          ))}
        </div>
      </div>

      <ol className="mt-3 px-2 pb-2">
        {SIGNALS.map((signal, index) => (
          <li
            key={signal.name}
            onPointerEnter={() => setActive(index)}
            onPointerLeave={() => setActive(null)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 ${
              active === index ? 'bg-white/[0.05]' : ''
            } ${shown ? 'animate-rise-in' : 'opacity-0'}`}
            style={{ animationDelay: `${index * 110}ms` }}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/80 transition-transform duration-200 ${
                active === index ? 'scale-110' : ''
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={signal.icon} />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-white/90">{signal.label}</span>
              <span className="mt-0.5 flex items-center gap-1.5 font-geist-mono text-[11px] text-white/40">
                <span className={`h-1.5 w-1.5 rounded-[2px] ${signal.tone}`} />
                {signal.name}
              </span>
            </span>
            <span className="font-geist-mono text-xs text-white/40 tabular-nums">
              {signal.time}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3 text-[0.75rem] text-white/45">
        <span>5 signals recorded</span>
        <span>Shown to the student before starting</span>
      </div>
    </div>
  );
}
