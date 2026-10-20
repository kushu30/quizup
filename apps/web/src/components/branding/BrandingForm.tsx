import { BRANDING_LIMITS, brandingSchema, type Branding } from '@quizup/shared';
import { useState, type FormEvent } from 'react';
import { readableTextOn } from '../../lib/brandColor';
import { Button, Notice, TextAreaField, TextField } from '../ui';
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
        <LogoUpload
          hostId={hostId}
          quizId={quizId}
          value={draft.logoUrl || undefined}
          onChange={(url) => set('logoUrl', url ?? '')}
        />
        <TextField
          label="Institution name"
          maxLength={BRANDING_LIMITS.institutionName}
          placeholder="Lincoln High School"
          value={draft.institutionName}
          error={errors.institutionName}
          onChange={(event) => set('institutionName', event.target.value)}
        />
        <TextField
          label="Tagline"
          hint="Optional. A short line under the name."
          maxLength={BRANDING_LIMITS.tagline}
          value={draft.tagline}
          error={errors.tagline}
          onChange={(event) => set('tagline', event.target.value)}
        />
        <div className="flex items-start gap-3">
          <TextField
            label="Brand colour"
            hint="Optional. Text on it switches to dark or light so it stays readable."
            placeholder="#1E5446"
            className="flex-1"
            value={draft.brandColor}
            error={errors.brandColor}
            onChange={(event) => set('brandColor', event.target.value)}
          />
          <input
            type="color"
            aria-label="Pick a brand colour"
            value={
              /^#[0-9a-fA-F]{6}$/.test(draft.brandColor) ? draft.brandColor : PREVIEW_DEFAULT_COLOR
            }
            onChange={(event) => set('brandColor', event.target.value)}
            className="mt-[1.625rem] h-10 w-12 shrink-0 cursor-pointer rounded-md border border-rule-strong bg-surface p-1"
          />
        </div>
        <TextAreaField
          label="Welcome message"
          hint="Optional. Shown on the first screen students see."
          rows={2}
          maxLength={BRANDING_LIMITS.welcomeMessage}
          value={draft.welcomeMessage}
          error={errors.welcomeMessage}
          onChange={(event) => set('welcomeMessage', event.target.value)}
        />
        <TextAreaField
          label="Instructions for students"
          hint="Optional. Shown before the assessment starts, above the standard rules."
          rows={4}
          maxLength={BRANDING_LIMITS.instructions}
          value={draft.instructions}
          error={errors.instructions}
          onChange={(event) => set('instructions', event.target.value)}
        />
        {saveError && <Notice tone="danger">{saveError}</Notice>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            Save branding
          </Button>
          <p role="status" className="text-sm font-medium text-success">
            {status}
          </p>
        </div>
      </form>

      <section
        aria-label="Preview"
        className="self-start overflow-hidden rounded-lg border border-rule"
      >
        <div className="px-4 py-4" style={{ backgroundColor: bandColor, color: bandText }}>
          <BrandMark branding={preview} tone={bandText === '#ffffff' ? 'dark' : 'light'} />
        </div>
        <div className="space-y-2 bg-surface px-4 py-5">
          <p className="text-xs font-medium text-muted">What students see first</p>
          <p className="text-lg font-semibold break-words">{quizTitle ?? 'Your assessment'}</p>
          <p className="text-sm break-words text-muted">
            {preview.welcomeMessage ?? 'Welcome. Read the instructions on the next screen.'}
          </p>
          <span
            className="mt-2 inline-flex min-h-8 items-center rounded-md px-3 text-sm font-semibold"
            style={{ backgroundColor: bandColor, color: bandText }}
          >
            Continue
          </span>
        </div>
      </section>
    </div>
  );
}
