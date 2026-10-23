import type { ReactNode } from 'react';
import { JoinQr } from '../JoinQr';

// Stand-ins for product screenshots in the "How it works" cards: small, static renderings of
// the editor, the host's join screen and the session summary, cropped like a screenshot.
const CARD =
  'rounded-xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.08),0_8px_24px_-12px_rgba(17,16,20,0.2)]';

function Window({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center gap-2 border-b border-dashed border-night/15 px-3 py-2">
        <span className="flex gap-1">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="h-2 w-2 rounded-full bg-night/10" />
          ))}
        </span>
        <span className="text-[11px] text-night/40">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function EditorShot() {
  const steps = ['Details', 'Branding', 'Questions', 'Review'];
  const questions = [
    {
      stem: 'Which isolation level prevents dirty reads?',
      options: ['Read committed', 'Serializable'],
      source: 'Written',
      approved: true,
    },
    {
      stem: 'What does an index trade away for faster reads?',
      options: ['Write speed and space', 'Query accuracy'],
      source: 'AI draft',
      approved: false,
    },
  ];
  return (
    <Window title="Database systems, week 6">
      <div className="flex gap-1 border-b border-dashed border-night/15 px-3 py-2">
        {steps.map((step, index) => (
          <span
            key={step}
            className={`rounded-md px-2 py-1 text-[11px] ${
              index === 2 ? 'bg-night/[0.06] font-medium text-night' : 'text-night/45'
            }`}
          >
            {index + 1} {step}
          </span>
        ))}
      </div>
      <div className="space-y-2 p-3">
        {questions.map((question) => (
          <div
            key={question.stem}
            className="rounded-lg p-3 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.08)]"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[12px] leading-snug font-medium">{question.stem}</p>
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${
                  question.approved
                    ? 'bg-accent-50 text-accent-800'
                    : 'bg-night/[0.05] text-night/60'
                }`}
              >
                {question.approved ? 'Approved' : 'Needs review'}
              </span>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-1.5">
              {question.options.map((option, index) => (
                <li
                  key={option}
                  className="rounded-md bg-night/[0.03] px-2 py-1 text-[11px] text-night/65"
                >
                  <span className="mr-1.5 font-geist-mono text-night/35">
                    {String.fromCharCode(65 + index)}
                  </span>
                  {option}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-night/40">{question.source}</p>
          </div>
        ))}
      </div>
    </Window>
  );
}

const SAMPLE_CODE = 'K7M2QX';

// The site shown in the sample link and encoded in the QR. Fixed, so the illustration reads the
// same in local development and in production.
const SAMPLE_SITE = 'quizup.kushu30.me';

export function CodeShot() {
  const joinUrl = `https://${SAMPLE_SITE}/join/${SAMPLE_CODE}`;
  return (
    <Window title="Live session, lobby">
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-5 p-4 sm:p-5">
        <div>
          <p className="text-[11px] text-night/45">Join code</p>
          <p className="mt-1 font-geist-mono text-[2rem] leading-none font-medium tracking-[0.16em]">
            {SAMPLE_CODE}
          </p>
          <p className="mt-3 flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[11px] text-night/55 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.1)]">
            <span className="truncate">{joinUrl.replace(/^https?:\/\//, '')}</span>
            <span className="font-medium text-night">Copy</span>
          </p>
          <p className="mt-4 text-[11px] text-night/45">4 in the lobby</p>
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {['Asha', 'Ben', 'Chen', 'Dana'].map((name) => (
              <li key={name} className="rounded-md bg-night/[0.05] px-1.5 py-0.5 text-[11px]">
                {name}
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-hidden rounded-md bg-white shadow-[inset_0_0_0_1px_rgba(17,16,20,0.1)]">
          <JoinQr url={joinUrl} />
        </div>
      </div>
    </Window>
  );
}

export function SummaryShot() {
  const stats = [
    { label: 'Average score', value: '78%' },
    { label: 'Students', value: '28' },
    { label: 'Average time', value: '11 s' },
  ];
  const spread = [2, 3, 5, 9, 14, 11, 6];
  const peak = Math.max(...spread);
  const struggled = [
    { stem: 'Phantom reads vs. non-repeatable reads', right: 41 },
    { stem: 'Choosing an index type', right: 55 },
    { stem: 'Foreign key actions', right: 63 },
  ];
  return (
    <Window title="Session summary">
      <div className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
        <div>
          <ul className="grid grid-cols-3 gap-2">
            {stats.map((stat) => (
              <li
                key={stat.label}
                className="rounded-lg p-2 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.08)]"
              >
                <p className="font-geist-mono text-base font-medium tabular-nums">{stat.value}</p>
                <p className="mt-0.5 text-[10px] text-night/45">{stat.label}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-night/45">Score spread</p>
          <div className="mt-2 flex h-20 items-end gap-1.5">
            {spread.map((count, index) => (
              <span
                key={index}
                className={`flex-1 rounded-t-sm ${count === peak ? 'bg-accent-500' : 'bg-night/20'}`}
                style={{ height: `${(count / peak) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[11px] text-night/45">Questions to revisit</p>
          <ul className="mt-2 space-y-2">
            {struggled.map((item) => (
              <li
                key={item.stem}
                className="rounded-lg p-2.5 shadow-[inset_0_0_0_1px_rgba(17,16,20,0.08)]"
              >
                <p className="text-[12px] leading-snug">{item.stem}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-night/[0.06]">
                    <span
                      className="block h-full rounded-full bg-night/40"
                      style={{ width: `${item.right}%` }}
                    />
                  </span>
                  <span className="font-geist-mono text-[10px] text-night/50 tabular-nums">
                    {item.right}% right
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] font-medium text-night/60">Export CSV</p>
        </div>
      </div>
    </Window>
  );
}
