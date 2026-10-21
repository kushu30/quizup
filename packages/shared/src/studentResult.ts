import { z } from 'zod';
import { DEFAULT_MODULE } from './api.js';

export const studentResultQuestionSchema = z.object({
  questionId: z.string().uuid(),
  stem: z.string(),
  module: z.string(),
  options: z.array(z.string()),
  /** Null when the student did not answer. */
  chosenIndex: z.number().int().nullable(),
  /** Null when the student did not answer, or when correct answers are hidden. */
  correct: z.boolean().nullable(),
  /** Null when correct answers are hidden from the viewer. */
  correctIndex: z.number().int().nullable(),
  responseMs: z.number().nullable(),
  points: z.number(),
});
export type StudentResultQuestion = z.infer<typeof studentResultQuestionSchema>;

export const studentResultModuleSchema = z.object({
  module: z.string(),
  total: z.number().int().nonnegative(),
  answered: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1).nullable(),
});
export type StudentResultModule = z.infer<typeof studentResultModuleSchema>;

export const studentResultSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
  displayName: z.string(),
  quizTitle: z.string(),
  mode: z.enum(['live', 'exam']),
  adaptive: z.boolean(),
  score: z.number(),
  rank: z.number().int().positive().nullable(),
  participantCount: z.number().int().nonnegative(),
  totalQuestions: z.number().int().nonnegative(),
  answered: z.number().int().nonnegative(),
  /** Null when correct answers are hidden from the viewer. */
  correct: z.number().int().nonnegative().nullable(),
  accuracy: z.number().min(0).max(1).nullable(),
  /** Exams: start to submit. Live: the sum of the time spent on each answer. */
  timeTakenMs: z.number().nullable(),
  /** False when the host chose not to show correct answers to students. */
  answersShown: z.boolean(),
  questions: z.array(studentResultQuestionSchema),
  modules: z.array(studentResultModuleSchema),
});
export type StudentResult = z.infer<typeof studentResultSchema>;

export const studentResultParamsSchema = z.object({
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
});

export interface StudentResultQuestionSource {
  id: string;
  stem: string;
  options: string[];
  topic: string;
  correctIndex: number;
}

export interface StudentResultResponseSource {
  questionId: string;
  chosenIndex: number;
  correct: boolean;
  responseMs: number;
  points: number;
}

export interface BuildStudentResultInput {
  sessionId: string;
  participantId: string;
  displayName: string;
  quizTitle: string;
  mode: 'live' | 'exam';
  adaptive: boolean;
  score: number;
  rank: number | null;
  participantCount: number;
  /** Question ids in the order this student met them. */
  questionOrder: readonly string[];
  questions: readonly StudentResultQuestionSource[];
  /** Only this student's responses. */
  responses: readonly StudentResultResponseSource[];
  timeTakenMs: number | null;
  /** Hosts always see correctness; students only when the quiz allows it. */
  showCorrect: boolean;
}

function moduleOf(topic: string): string {
  return topic.trim() === '' ? DEFAULT_MODULE : topic;
}

export function buildStudentResult(input: BuildStudentResultInput): StudentResult {
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const responseByQuestion = new Map(
    input.responses.map((response) => [response.questionId, response]),
  );

  const questions: StudentResultQuestion[] = input.questionOrder.flatMap((questionId) => {
    const question = questionById.get(questionId);
    if (!question) {
      return [];
    }
    const response = responseByQuestion.get(questionId);
    return [
      {
        questionId,
        stem: question.stem,
        module: moduleOf(question.topic),
        options: question.options,
        chosenIndex: response ? response.chosenIndex : null,
        correct: response && input.showCorrect ? response.correct : null,
        correctIndex: input.showCorrect ? question.correctIndex : null,
        responseMs: response ? response.responseMs : null,
        points: response ? response.points : 0,
      },
    ];
  });

  const answered = questions.filter((question) => question.chosenIndex !== null).length;
  const correctCount = input.responses.filter(
    (response) => response.correct && questionById.has(response.questionId),
  ).length;

  const modules: StudentResultModule[] = [];
  if (input.showCorrect) {
    const byModule = new Map<string, StudentResultModule>();
    for (const question of questions) {
      const entry = byModule.get(question.module) ?? {
        module: question.module,
        total: 0,
        answered: 0,
        correct: 0,
        accuracy: null,
      };
      entry.total += 1;
      if (question.chosenIndex !== null) {
        entry.answered += 1;
      }
      if (question.correct) {
        entry.correct += 1;
      }
      byModule.set(question.module, entry);
    }
    for (const entry of byModule.values()) {
      modules.push({
        ...entry,
        accuracy: entry.answered > 0 ? entry.correct / entry.answered : null,
      });
    }
  }

  return {
    sessionId: input.sessionId,
    participantId: input.participantId,
    displayName: input.displayName,
    quizTitle: input.quizTitle,
    mode: input.mode,
    adaptive: input.adaptive,
    score: input.score,
    rank: input.rank,
    participantCount: input.participantCount,
    totalQuestions: questions.length,
    answered,
    correct: input.showCorrect ? correctCount : null,
    accuracy: input.showCorrect && answered > 0 ? correctCount / answered : null,
    timeTakenMs: input.timeTakenMs,
    answersShown: input.showCorrect,
    questions,
    modules,
  };
}
