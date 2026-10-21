import { BRANDING_LIMITS, brandingSchema, type Branding } from '@quizup/shared';
import { useState, type FormEvent } from 'react';
import { readableTextOn } from '../../lib/brandColor';
import { AuthField, AuthNotice, AuthTextArea } from '../landing/AuthField';
import { ctaDark, ctaSize } from '../landing/cta';
import { BrandMark } from './BrandMark';
import { LogoUpload } from './LogoUpload';

type BrandingField = keyof Branding;

interface BrandingFormProps {
  initial: Branding;
  hostId: string;
  quizId: string;
  quizTitle?: string;
  onSave: (branding: Branding) => Promise<void>;
}

const PREVIEW_DEFAULT_COLOR = '#1e5446';

export function BrandingForm({ initial, hostId, quizId, quizTitle, onSave }: BrandingFormProps) {
  const [draft, setDraft] = useState<Record<BrandingField, string>>({
    institutionName: initial.institutionName ?? '',
    logoUrl: initial.logoUrl ?? '',
    tagline: initial.tagline ?? '',
    brandColor: initial.brandColor ?? '',
    welcomeMessage: initial.welcomeMessage ?? '',
    instructions: initial.instructions ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<BrandingField, string>>>({});
  const [status, setStatus] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set(field: BrandingField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setStatus('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaveError(null);
    const parsed = brandingSchema.safeParse(draft);
    if (!parsed.success) {
      const next: Partial<Record<BrandingField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as BrandingField;
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSave(parsed.data);
      setStatus('Branding saved');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the branding');
    } finally {
      setSaving(false);
    }
  }

  const previewBranding = brandingSchema.safeParse(draft);
  const preview: Branding = previewBranding.success ? previewBranding.data : {};
  const bandColor = preview.brandColor ?? PREVIEW_DEFAULT_COLOR;
  const bandText = readableTextOn(bandColor);

  return (
    <div className="space-y-6">
      <section aria-label="Preview">
        <p className="mb-2 text-xs font-medium text-night/45">What students see first</p>
        <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.09)] sm:flex-row">
          <div
            className="flex items-center px-5 py-4 sm:w-56 sm:shrink-0"
            style={{ backgroundColor: bandColor, color: bandText }}
          >
            <BrandMark branding={preview} tone={bandText === '#ffffff' ? 'dark' : 'light'} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1 px-5 py-4">
            <p className="text-base font-medium tracking-tight break-words">
              {quizTitle ?? 'Your assessment'}
            </p>
            <p className="text-sm break-words text-night/55">
              {preview.welcomeMessage ?? 'Welcome. Read the instructions on the next screen.'}
            </p>
            <span
              className="mt-2 inline-flex h-8 items-center rounded-[0.6rem] px-3 text-sm font-medium"
              style={{ backgroundColor: bandColor, color: bandText }}
            >
              Continue
            </span>
          </div>
        </div>
      </section>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
        <div className="grid items-start gap-x-6 gap-y-4 md:grid-cols-2">
          <LogoUpload
            hostId={hostId}
            quizId={quizId}
            value={draft.logoUrl || undefined}
            onChange={(url) => set('logoUrl', url ?? '')}
          />
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <AuthField
                label="Brand colour"
                hint="Optional. Text on it switches to dark or light so it stays readable."
                placeholder="#1E5446"
                value={draft.brandColor}
                error={errors.brandColor}
                onChange={(event) => set('brandColor', event.target.value)}
              />
            </div>
            <input
              type="color"
              aria-label="Pick a brand colour"
              value={
                /^#[0-9a-fA-F]{6}$/.test(draft.brandColor)
                  ? draft.brandColor
                  : PREVIEW_DEFAULT_COLOR
              }
              onChange={(event) => set('brandColor', event.target.value)}
              className="mt-[1.625rem] h-10 w-10 shrink-0 cursor-pointer rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(17,16,20,0.12)]"
            />
          </div>
          <AuthField
            label="Institution name"
            maxLength={BRANDING_LIMITS.institutionName}
            placeholder="Lincoln High School"
            value={draft.institutionName}
            error={errors.institutionName}
            onChange={(event) => set('institutionName', event.target.value)}
          />
          <AuthField
            label="Tagline"
            hint="Optional. A short line under the name."
            maxLength={BRANDING_LIMITS.tagline}
            value={draft.tagline}
            error={errors.tagline}
            onChange={(event) => set('tagline', event.target.value)}
          />
          <AuthTextArea
            label="Welcome message"
            hint="Optional. Shown on the first screen students see."
            rows={3}
            maxLength={BRANDING_LIMITS.welcomeMessage}
            value={draft.welcomeMessage}
            error={errors.welcomeMessage}
            onChange={(event) => set('welcomeMessage', event.target.value)}
          />
          <AuthTextArea
            label="Instructions for students"
            hint="Optional. Shown before the assessment starts, above the standard rules."
            rows={3}
            maxLength={BRANDING_LIMITS.instructions}
            value={draft.instructions}
            error={errors.instructions}
            onChange={(event) => set('instructions', event.target.value)}
          />
        </div>
        {saveError && <AuthNotice tone="danger">{saveError}</AuthNotice>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className={`${ctaDark} ${ctaSize.md}`}>
            Save branding
          </button>
          <p role="status" className="text-sm font-medium text-accent-700">
            {status}
          </p>
        </div>
      </form>
    </div>
  );
}
