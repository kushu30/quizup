import { z } from 'zod';
import { accessModeSchema } from './adaptive.js';
import { brandingSchema } from './branding.js';
import { sessionStatusSchema } from './enums.js';

export const joinInfoSchema = z.object({
  quizTitle: z.string(),
  branding: brandingSchema.nullable(),
  assessmentType: z.enum(['live', 'adaptive', 'exam']),
  accessMode: accessModeSchema,
  durationMinutes: z.number().int().positive().nullable(),
  status: sessionStatusSchema,
});
export type JoinInfo = z.infer<typeof joinInfoSchema>;
