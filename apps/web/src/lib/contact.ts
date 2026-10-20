import { HOST_ACCESS_CONTACT_EMAIL } from '@quizup/shared';

export { HOST_ACCESS_CONTACT_EMAIL };

export const HOST_ACCESS_MAILTO = `mailto:${HOST_ACCESS_CONTACT_EMAIL}?subject=${encodeURIComponent(
  'QuizUp host access request',
)}`;
