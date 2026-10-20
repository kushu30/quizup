import { findOwnedQuiz } from './ownership.js';
import { supabaseAdmin } from './supabaseAdmin.js';

export interface OrderRepository {
  ownsQuiz: (quizId: string, hostId: string) => Promise<boolean>;
  applyOrder: (quizId: string, questionIds: string[]) => Promise<boolean>;
}

export const supabaseOrderRepository: OrderRepository = {
  ownsQuiz: async (quizId, hostId) => (await findOwnedQuiz(quizId, hostId)) !== null,
  applyOrder: async (quizId, questionIds) => {
    const { error } = await supabaseAdmin.rpc('reorder_questions', {
      target_quiz_id: quizId,
      ordered_ids: questionIds,
    });
    if (!error) {
      return true;
    }
    if (error.message.includes('question_order_invalid')) {
      return false;
    }
    throw new Error(error.message);
  },
};

export type ReorderOutcome = 'ok' | 'quiz_not_found' | 'invalid_order';

export async function reorderQuestions(
  repository: OrderRepository,
  hostId: string,
  quizId: string,
  questionIds: string[],
): Promise<ReorderOutcome> {
  if (!(await repository.ownsQuiz(quizId, hostId))) {
    return 'quiz_not_found';
  }
  return (await repository.applyOrder(quizId, questionIds)) ? 'ok' : 'invalid_order';
}
