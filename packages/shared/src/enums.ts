import { z } from 'zod';

export const userRoleSchema = z.enum(['host', 'student', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const signUpRoleSchema = z.enum(['host', 'student']);
export type SignUpRole = z.infer<typeof signUpRoleSchema>;

export const quizModeSchema = z.enum(['live', 'exam', 'coding']);
export type QuizMode = z.infer<typeof quizModeSchema>;

export const difficultySchema = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof difficultySchema>;

export const questionSourceSchema = z.enum(['manual', 'llm']);
export type QuestionSource = z.infer<typeof questionSourceSchema>;

export const sessionStatusSchema = z.enum(['lobby', 'running', 'ended']);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
