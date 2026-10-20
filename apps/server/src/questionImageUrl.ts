import { QUESTION_IMAGE_BUCKET } from '@quizup/shared';

export function isOwnQuestionImageUrl(candidate: string, supabaseUrl: string): boolean {
  try {
    const url = new URL(candidate);
    const own = new URL(supabaseUrl);
    return (
      url.protocol === 'https:' &&
      url.origin === own.origin &&
      url.pathname.startsWith(`/storage/v1/object/public/${QUESTION_IMAGE_BUCKET}/`)
    );
  } catch {
    return false;
  }
}
