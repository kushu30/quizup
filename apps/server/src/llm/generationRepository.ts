import { questionSchema, type Question } from '@quizup/shared';
import { throwIfSupabaseError } from '../http.js';
import { findOwnedQuiz } from '../ownership.js';
import { supabaseAdmin } from '../supabaseAdmin.js';
import type { QuestionDraft } from './generateQuestions.js';

export interface GenerationRepository {
  findOwnedQuiz: (quizId: string, hostId: string) => Promise<{ id: string } | null>;
  insertGeneratedQuestions: (quizId: string, drafts: QuestionDraft[]) => Promise<Question[]>;
}

export const supabaseGenerationRepository: GenerationRepository = {
  findOwnedQuiz,

  async insertGeneratedQuestions(quizId, drafts) {
    const { data, error } = await supabaseAdmin
      .from('questions')
      .insert(
        drafts.map((draft) => ({
          ...draft,
          quiz_id: quizId,
          source: 'llm',
          approved: false,
        })),
      )
      .select('*');
    throwIfSupabaseError(error);
    return (data ?? []).map((row) => questionSchema.parse(row));
  },
};
