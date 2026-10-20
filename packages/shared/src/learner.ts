export const PROVISIONAL_QUESTION_ANSWERS = 30;

export function isProvisionalQuestion(answersCount: number): boolean {
  return answersCount < PROVISIONAL_QUESTION_ANSWERS;
}
