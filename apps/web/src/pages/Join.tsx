import {
  ACCESS_TOKEN_LENGTH,
  formatAccessToken,
  joinFormSchema,
  normalizeAccessToken,
  type JoinInfo,
} from '@quizup/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../components/branding/BrandMark';
import { Button, Notice, PageHeader, TextField, buttonClasses } from '../components/ui';
import { usePageBrand } from '../lib/brandContext';
import { readableTextOn } from '../lib/brandColor';
import { useJoinInfo } from '../lib/useJoinInfo';

type FieldErrors = Partial<Record<'joinCode' | 'displayName' | 'accessToken', string>>;

const DEFAULT_COLOR = '#1e5446';

const TYPE_LABELS = { live: 'Live quiz', adaptive: 'Adaptive quiz', exam: 'Timed exam' } as const;

function typeLine(info: JoinInfo): string {
  const label = TYPE_LABELS[info.assessmentType];
  return info.assessmentType === 'exam' && info.durationMinutes
    ? `${label}, ${info.durationMinutes} minutes`
    : label;
}

function tokenFromHash(hash: string): string {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? '';
  const normalized = normalizeAccessToken(value);
  return normalized.length === ACCESS_TOKEN_LENGTH ? formatAccessToken(normalized) : '';
}

export function Join() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { code: pathCode } = useParams();
  const prefilledCode = (pathCode ?? searchParams.get('code') ?? '').trim().toUpperCase();
  const [joinCode, setJoinCode] = useState(prefilledCode);
  const [displayName, setDisplayName] = useState('');
  const [accessToken, setAccessToken] = useState(() => tokenFromHash(location.hash));
  const [errors, setErrors] = useState<FieldErrors>({});
  const info = useJoinInfo(joinCode);
  usePageBrand(info?.branding ?? null, true);

  useEffect(() => {
    if (location.hash) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  const tokenMode = info?.accessMode === 'token';
  const ended = info?.status === 'ended';
  const color = info?.branding?.brandColor ?? DEFAULT_COLOR;
  const onColor = readableTextOn(color);
  const hasCustomColor = Boolean(info?.branding?.brandColor);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (ended) {
      return;
    }
    const result = joinFormSchema.safeParse({
      joinCode,
      displayName: tokenMode ? 'token' : displayName,
    });
    const normalizedToken = normalizeAccessToken(accessToken);
    if (!result.success || (tokenMode && normalizedToken.length !== ACCESS_TOKEN_LENGTH)) {
      const next: FieldErrors = {};
      for (const issue of result.success ? [] : result.error.issues) {
        const field = issue.path[0];
        if ((field === 'joinCode' || field === 'displayName') && !next[field]) {
          next[field] = issue.message;
        }
      }
      if (tokenMode && normalizedToken.length !== ACCESS_TOKEN_LENGTH) {
        next.accessToken = `Enter the ${ACCESS_TOKEN_LENGTH}-character token your host gave you`;
      }
      setErrors(next);
      return;
    }
    navigate(`/play/${result.data.joinCode}`, {
      state: tokenMode
        ? { accessToken: normalizedToken, joinInfo: info ?? undefined }
        : { displayName: result.data.displayName, joinInfo: info ?? undefined },
    });
  }

  const form = (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <TextField
        label="Join code"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        autoFocus={!prefilledCode}
        value={joinCode}
        error={errors.joinCode}
        onChange={(event) => setJoinCode(event.target.value)}
        inputClassName="py-3 text-center text-title font-semibold tracking-[0.3em] uppercase tabular-nums"
      />
      {tokenMode ? (
        <TextField
          label="Access token"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={Boolean(prefilledCode) && !accessToken}
          value={accessToken}
          error={errors.accessToken}
          hint="Your host gave you a personal token. It works only for you."
          onChange={(event) => setAccessToken(event.target.value.toUpperCase())}
          inputClassName="py-3 text-center text-title font-semibold tracking-[0.2em] tabular-nums"
        />
      ) : (
        <TextField
          label="Display name"
          autoComplete="off"
          autoFocus={Boolean(prefilledCode)}
          value={displayName}
          error={errors.displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          inputClassName="py-3 text-lg"
        />
      )}
      {ended && (
        <Notice tone="warning">This quiz has ended. Ask your host for a new join code.</Notice>
      )}
      {hasCustomColor ? (
        <button
          type="submit"
          disabled={ended}
          className={`${buttonClasses('primary', 'lg')} w-full hover:opacity-90`}
          style={{ backgroundColor: color, color: onColor }}
        >
          Join
        </button>
      ) : (
        <Button type="submit" size="lg" className="w-full" disabled={ended}>
          Join
        </Button>
      )}
    </form>
  );

  return (
    <div
      className={
        info
          ? 'mx-auto max-w-xl overflow-hidden rounded-xl border border-rule bg-surface'
          : 'mx-auto max-w-md'
      }
    >
      {info && (
        <div className="px-6 py-6 sm:px-8" style={{ backgroundColor: color, color: onColor }}>
          <BrandMark
            branding={info.branding}
            size="lg"
            tone={onColor === '#ffffff' ? 'dark' : 'light'}
          />
        </div>
      )}
      <div className={info ? 'space-y-6 px-6 py-7 sm:px-8' : undefined}>
        {info ? (
          <div className="space-y-3">
            <span className="inline-block rounded-md bg-paper px-2 py-1 text-xs font-semibold text-muted">
              {typeLine(info)}
            </span>
            <h1 className="text-title font-semibold tracking-tight break-words sm:text-hero">
              {info.quizTitle}
            </h1>
            {info.branding?.welcomeMessage ? (
              <p className="text-lg whitespace-pre-line text-muted">
                {info.branding.welcomeMessage}
              </p>
            ) : (
              <p className="text-lg text-muted">
                {tokenMode ? 'Enter your access token to join.' : 'Enter your name to join.'}
              </p>
            )}
            {tokenMode && (
              <p className="text-sm text-muted">
                This is for invited students only. You need the personal access token your host gave
                you.
              </p>
            )}
          </div>
        ) : (
          <PageHeader
            title="Join a quiz"
            description="Enter the code your host shows on screen and the name others will see."
          />
        )}
        {form}
      </div>
    </div>
  );
}
