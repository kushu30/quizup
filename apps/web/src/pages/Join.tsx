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
import { AuthField, AuthNotice } from '../components/landing/AuthField';
import { ctaPrimary, ctaSize, ctaSolid } from '../components/landing/cta';
import { Frame } from '../components/landing/frame';
import { hasVisibleBrand, usePageBrand } from '../lib/brandContext';
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
  // A branded quiz keeps its institution's own header above the page, so less room is needed.
  const branded = hasVisibleBrand(info?.branding ?? null);

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
      <AuthField
        label="Join code"
        look="code"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        autoFocus={!prefilledCode}
        placeholder="K7M2QX"
        value={joinCode}
        error={errors.joinCode}
        onChange={(event) => setJoinCode(event.target.value)}
      />
      {tokenMode ? (
        <AuthField
          label="Access token"
          look="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={Boolean(prefilledCode) && !accessToken}
          value={accessToken}
          error={errors.accessToken}
          hint="Your host gave you a personal token. It works only for you."
          onChange={(event) => setAccessToken(event.target.value.toUpperCase())}
        />
      ) : (
        <AuthField
          label="Display name"
          autoComplete="off"
          autoFocus={Boolean(prefilledCode)}
          placeholder="The name others will see"
          value={displayName}
          error={errors.displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      )}
      {ended && (
        <AuthNotice tone="warning">
          This quiz has ended. Ask your host for a new join code.
        </AuthNotice>
      )}
      {hasCustomColor ? (
        <button
          type="submit"
          disabled={ended}
          className={`${ctaSolid} ${ctaSize.lg} w-full`}
          style={{ backgroundColor: color, color: onColor }}
        >
          Join
        </button>
      ) : (
        <button type="submit" disabled={ended} className={`${ctaPrimary} ${ctaSize.lg} w-full`}>
          Join
        </button>
      )}
    </form>
  );

  // The wrappers stay the same whether or not the quiz has been looked up, so the field being
  // typed in keeps its place (and the cursor) when the quiz's details appear.
  return (
    <section className="flex flex-1 flex-col font-geist text-night">
      <Frame
        className={`flex w-full flex-1 flex-col items-center pb-20 ${
          branded ? 'pt-12 sm:pt-16' : 'pt-32 sm:pt-36'
        }`}
      >
        <div className="w-full max-w-md">
          <div
            className={
              info
                ? 'overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.07),0_16px_40px_-24px_rgba(17,16,20,0.35)]'
                : undefined
            }
          >
            {branded && info && (
              <div className="px-6 py-6 sm:px-8" style={{ backgroundColor: color, color: onColor }}>
                <BrandMark
                  branding={info.branding}
                  size="lg"
                  tone={onColor === '#ffffff' ? 'dark' : 'light'}
                />
              </div>
            )}
            <div className={info ? 'p-6 sm:p-8' : undefined}>
              {info ? (
                <div className="mb-8">
                  <span className="inline-flex rounded-lg bg-night/[0.05] px-2.5 py-1 text-[0.8125rem] font-medium text-night/60">
                    {typeLine(info)}
                  </span>
                  <h1 className="mt-4 text-[2rem] leading-[1.1] font-medium tracking-[-0.035em] break-words">
                    {info.quizTitle}
                  </h1>
                  {info.branding?.welcomeMessage ? (
                    <p className="mt-3 leading-relaxed whitespace-pre-line text-night/60">
                      {info.branding.welcomeMessage}
                    </p>
                  ) : (
                    <p className="mt-3 leading-relaxed text-night/60">
                      {tokenMode ? 'Enter your access token to join.' : 'Enter your name to join.'}
                    </p>
                  )}
                  {tokenMode && (
                    <p className="mt-2 text-sm text-night/50">
                      This is for invited students only. You need the personal access token your
                      host gave you.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mb-8">
                  <h1 className="text-[2rem] leading-[1.1] font-medium tracking-[-0.035em] sm:text-[2.25rem]">
                    Join a quiz
                  </h1>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed text-night/55">
                    Enter the code your host shows on screen and the name others will see.
                  </p>
                </div>
              )}
              {form}
            </div>
          </div>
        </div>
      </Frame>
    </section>
  );
}
