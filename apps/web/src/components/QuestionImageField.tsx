import {
  QUESTION_IMAGE_ALT_MAX,
  QUESTION_IMAGE_BUCKET,
  QUESTION_IMAGE_MAX_BYTES,
} from '@quizup/shared';
import { useId, useState, type ChangeEvent } from 'react';
import { AuthField, AuthNotice } from './landing/AuthField';
import { ctaQuietDanger, ctaSize } from './landing/cta';

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

interface QuestionImageValue {
  imageUrl: string | null;
  imageAlt: string | null;
}

interface QuestionImageFieldProps extends QuestionImageValue {
  onChange: (value: QuestionImageValue) => void;
}

function validate(file: File): string | null {
  if (!(file.type in EXTENSION_BY_TYPE)) {
    return 'Use a PNG, JPEG or WebP image.';
  }
  if (file.size > QUESTION_IMAGE_MAX_BYTES) {
    return 'The image must be 2 MB or smaller.';
  }
  return null;
}

export function QuestionImageField({ imageUrl, imageAlt, onChange }: QuestionImageFieldProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
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
      const { supabase } = await import('../lib/supabase');
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) {
        setUploadError('You are signed out. Sign in again to upload an image.');
        return;
      }
      const path = `${userId}/${crypto.randomUUID()}.${EXTENSION_BY_TYPE[file.type]}`;
      const bucket = supabase.storage.from(QUESTION_IMAGE_BUCKET);
      const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setUploadError(`The image could not be uploaded: ${error.message}`);
        return;
      }
      onChange({ imageUrl: bucket.getPublicUrl(path).data.publicUrl, imageAlt: imageAlt ?? '' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-night">
        Image (optional)
      </label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? `${hintId} ${errorId}` : hintId}
          onChange={(event) => void handleChosen(event)}
          className="block max-w-full text-sm text-night/55 file:mr-3 file:h-9 file:cursor-pointer file:rounded-[0.7rem] file:border-0 file:bg-night file:px-3.5 file:text-sm file:font-medium file:text-white file:transition-[filter] hover:file:brightness-125 disabled:opacity-50"
        />
        <p id={hintId} className="text-[0.8125rem] text-night/50">
          PNG, JPEG or WebP, up to 2 MB. Students see it above the answers.
        </p>
      </div>
      {fieldError && (
        <p id={errorId} className="text-[0.8125rem] font-medium text-alert">
          {fieldError}
        </p>
      )}
      {uploading && (
        <p role="status" className="text-sm text-night/55">
          Uploading...
        </p>
      )}
      {uploadError && <AuthNotice tone="danger">{uploadError}</AuthNotice>}
      {imageUrl && (
        <div className="flex flex-wrap items-start gap-4 pt-1">
          <img
            src={imageUrl}
            alt="Chosen image"
            className="h-20 w-20 shrink-0 rounded-xl bg-white object-contain shadow-[0_0_0_1px_rgba(17,16,20,0.1)]"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <AuthField
              label="Describe the image"
              maxLength={QUESTION_IMAGE_ALT_MAX}
              hint="For students who use a screen reader or cannot see the picture."
              value={imageAlt ?? ''}
              onChange={(event) => onChange({ imageUrl, imageAlt: event.target.value })}
            />
            <button
              type="button"
              onClick={() => onChange({ imageUrl: null, imageAlt: null })}
              className={`${ctaQuietDanger} ${ctaSize.sm} -ml-3.5`}
            >
              Remove image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
