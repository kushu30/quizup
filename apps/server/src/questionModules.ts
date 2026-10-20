import { supabaseAdmin } from './supabaseAdmin.js';
import { throwIfSupabaseError } from './http.js';
import { listOwnedQuizIds } from './ownership.js';

export interface ModuleRepository {
  listOwnedQuizIds: (hostId: string) => Promise<string[]>;
  moveQuestions: (quizIds: string[], questionIds: string[], topic: string) => Promise<number>;
}

export const supabaseModuleRepository: ModuleRepository = {
  listOwnedQuizIds: (hostId) => listOwnedQuizIds(hostId),
  moveQuestions: async (quizIds, questionIds, topic) => {
    const { data, error } = await supabaseAdmin
      .from('questions')
      .update({ topic })
      .in('quiz_id', quizIds)
      .in('id', questionIds)
      .select('id');
    throwIfSupabaseError(error);
    return (data ?? []).length;
  },
};

export async function moveQuestionsToModule(
  repository: ModuleRepository,
  hostId: string,
  questionIds: string[],
  topic: string,
): Promise<number> {
  const quizIds = await repository.listOwnedQuizIds(hostId);
  if (quizIds.length === 0) {
    return 0;
  }
  return repository.moveQuestions(quizIds, questionIds, topic);
}
