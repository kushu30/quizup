import { useId, useState, type ChangeEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { AuthNotice } from '../landing/AuthField';
import { ctaQuietDanger, ctaSize } from '../landing/cta';

const MAX_LOGO_BYTES = 1024 * 1024;
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

interface LogoUploadProps {
  hostId: string;
  quizId: string;
  value: string | undefined;
  onChange: (logoUrl: string | undefined) => void;
}

function validate(file: File): string | null {
  if (!(file.type in EXTENSION_BY_TYPE)) {
    return 'Use a PNG, JPEG or WebP image.';
  }
  if (file.size > MAX_LOGO_BYTES) {
    return 'The logo must be 1 MB or smaller.';
  }
  return null;
}

export function LogoUpload({ hostId, quizId, value, onChange }: LogoUploadProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setUploadError(null);
    const problem = validate(file);
    setFieldError(problem);
    if (problem) {
      return;
    }
    setUploading(true);
    try {
      const path = `${hostId}/${quizId}-${Date.now()}.${EXTENSION_BY_TYPE[file.type]}`;
      const bucket = supabase.storage.from('branding');
      const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setUploadError(`The logo could not be uploaded: ${error.message}`);
        return;
      }
      onChange(bucket.getPublicUrl(path).data.publicUrl);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium text-night">
        Logo
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(17,16,20,0.1)]">
          {value ? (
            <img src={value} alt="Current logo" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-night/40">No logo</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? `${hintId} ${errorId}` : hintId}
            onChange={(event) => void handleChosen(event)}
            className="block w-full text-sm text-night/55 file:mr-3 file:h-9 file:cursor-pointer file:rounded-[0.7rem] file:border-0 file:bg-night file:px-3.5 file:text-sm file:font-medium file:text-white file:transition-[filter] hover:file:brightness-125 disabled:opacity-50"
          />
          <p id={hintId} className="text-sm text-night/50">
            PNG, JPEG or WebP, up to 1 MB. A square logo looks best.
          </p>
          {fieldError && (
            <p id={errorId} className="text-sm font-medium text-alert">
              {fieldError}
            </p>
          )}
          {uploading && (
            <p role="status" className="text-sm text-night/55">
              Uploading...
            </p>
          )}
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className={`${ctaQuietDanger} ${ctaSize.sm} -ml-3.5`}
            >
              Remove logo
            </button>
          )}
        </div>
      </div>
      {uploadError && <AuthNotice tone="danger">{uploadError}</AuthNotice>}
    </div>
  );
}
