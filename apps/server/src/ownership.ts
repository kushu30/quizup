import { questionSchema, quizSchema, type Question, type Quiz } from '@quizup/shared';
import { supabaseAdmin } from './supabaseAdmin.js';
import { throwIfSupabaseError } from './http.js';

export async function findOwnedQuiz(quizId: string, hostId: string): Promise<Quiz | null> {
  const { data, error } = await supabaseAdmin
    .from('quizzes')
    .select('*')
    .eq('id', quizId)
    .eq('host_id', hostId)
    .maybeSingle();
  throwIfSupabaseError(error);
  return data ? quizSchema.parse(data) : null;
}

export async function findOwnedQuestion(
  questionId: string,
  hostId: string,
): Promise<Question | null> {
  const { data, error } = await supabaseAdmin
    .from('questions')
    .select('*')
    .eq('id', questionId)
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!data) {
    return null;
  }
  const question = questionSchema.parse(data);
  const quiz = await findOwnedQuiz(question.quiz_id, hostId);
  return quiz ? question : null;
}

export async function listOwnedQuizIds(hostId: string, onlyQuizId?: string): Promise<string[]> {
  let query = supabaseAdmin.from('quizzes').select('id').eq('host_id', hostId);
  if (onlyQuizId) {
    query = query.eq('id', onlyQuizId);
  }
  const { data, error } = await query;
  throwIfSupabaseError(error);
  return (data ?? []).map((row: { id: string }) => row.id);
}
