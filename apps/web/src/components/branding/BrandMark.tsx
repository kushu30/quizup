import type { Branding } from '@quizup/shared';
import { readableTextOn } from '../../lib/brandColor';
import { QuizUpLogo } from '../brand/QuizUpLogo';

const DEFAULT_BRAND_COLOR = '#1e5446';

interface BrandMarkProps {
  branding: Branding | null;
  size?: 'xs' | 'sm' | 'lg';
  tone?: 'light' | 'dark';
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export function QuizUpMark({
  tone = 'light',
  small = false,
}: {
  tone?: 'light' | 'dark';
  small?: boolean;
}) {
  return <QuizUpLogo size={small ? 18 : 26} tone={tone === 'dark' ? 'onDark' : 'color'} />;
}

export function PoweredBy({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap ${tone === 'dark' ? 'text-white/80' : 'text-muted'}`}
    >
      Powered by <QuizUpMark tone={tone} small />
    </span>
  );
}

export function BrandMark({ branding, size = 'sm', tone = 'light' }: BrandMarkProps) {
  const name = branding?.institutionName;
  if (!branding || (!name && !branding.logoUrl)) {
    return <QuizUpMark tone={tone} />;
  }
  const color = branding.brandColor ?? DEFAULT_BRAND_COLOR;
  const box =
    size === 'lg' ? 'h-16 w-16 text-xl' : size === 'xs' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';

  if (size === 'xs') {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={`${name ?? 'Institution'} logo`}
              className={`${box} shrink-0 rounded-md bg-white object-contain ring-1 ring-black/10`}
            />
          ) : (
            <span
              aria-hidden="true"
              className={`${box} flex shrink-0 items-center justify-center rounded-md font-bold ring-1 ring-black/10`}
              style={{ backgroundColor: color, color: readableTextOn(color) }}
            >
              {initialsOf(name ?? '')}
            </span>
          )}
          {name && <p className="truncate text-sm font-semibold">{name}</p>}
        </div>
        <PoweredBy tone={tone} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      {branding.logoUrl ? (
        <img
          src={branding.logoUrl}
          alt={`${name ?? 'Institution'} logo`}
          className={`${box} shrink-0 rounded-md bg-white object-contain ring-1 ring-black/10`}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`${box} flex shrink-0 items-center justify-center rounded-md font-bold ring-1 ring-black/10`}
          style={{ backgroundColor: color, color: readableTextOn(color) }}
        >
          {initialsOf(name ?? '')}
        </span>
      )}
      <div className="min-w-0">
        {name && (
          <p
            className={`truncate font-semibold ${size === 'lg' ? 'text-xl' : 'text-base'} ${
              tone === 'dark' ? 'text-white' : 'text-ink'
            }`}
          >
            {name}
          </p>
        )}
        {branding.tagline && (
          <p className={`truncate text-sm ${tone === 'dark' ? 'text-white/80' : 'text-muted'}`}>
            {branding.tagline}
          </p>
        )}
        <PoweredBy tone={tone} />
      </div>
    </div>
  );
}
