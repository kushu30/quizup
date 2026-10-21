import {
  assessmentTypeOf,
  quizSettingsSchema,
  splitStoredBranding,
  type AssessmentType,
  type Branding,
  type Quiz,
} from '@quizup/shared';
import { readableTextOn } from '../lib/brandColor';
import { initialsOf } from './branding/BrandMark';
import type { ReactNode } from 'react';
import { AppIcon, ICONS } from './app/icons';

// Small pieces that describe a quiz, shared by the host dashboard and a student's results.

export const TYPE_LABELS: Record<AssessmentType, string> = {
  live: 'Live quiz',
  adaptive: 'Adaptive quiz',
  exam: 'Timed exam',
};

// The kind of quiz from its stored settings, falling back to a live quiz.
export function quizTypeOf(quiz: Pick<Quiz, 'settings'>): AssessmentType {
  const parsed = quizSettingsSchema.safeParse(splitStoredBranding(quiz.settings).settings);
  return parsed.success ? assessmentTypeOf(parsed.data) : 'live';
}

// One colour per kind of quiz, the same as on the landing page.
const TYPE_ACCENTS: Record<AssessmentType, string> = {
  live: '#2b8cf5',
  adaptive: '#7d64f0',
  exam: '#f59e0b',
};

const TYPE_ICONS: Record<AssessmentType, ReactNode> = {
  live: ICONS.live,
  adaptive: ICONS.adaptive,
  exam: ICONS.exam,
};

// A line icon for the kind of quiz, drawn in that kind's colour.
export function QuizTypeIcon({ type, size = 20 }: { type: AssessmentType; size?: number }) {
  return (
    <span className="inline-flex shrink-0" style={{ color: TYPE_ACCENTS[type] }}>
      <AppIcon size={size}>{TYPE_ICONS[type]}</AppIcon>
    </span>
  );
}

// The institution a quiz belongs to: its logo, or its initials on its colour, and its name.
export function Institution({ branding }: { branding: Branding }) {
  const name = branding.institutionName;
  if (!name && !branding.logoUrl) {
    return null;
  }
  const color = branding.brandColor ?? '#111014';
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {branding.logoUrl ? (
        <img
          src={branding.logoUrl}
          alt={`${name ?? 'Institution'} logo`}
          className="h-[18px] w-[18px] shrink-0 rounded-[5px] bg-white object-contain ring-1 ring-black/10"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[5px] px-0.5 text-[9px] font-semibold"
          style={{ backgroundColor: color, color: readableTextOn(color) }}
        >
          {initialsOf(name ?? '')}
        </span>
      )}
      {name && <span className="truncate">{name}</span>}
    </span>
  );
}
