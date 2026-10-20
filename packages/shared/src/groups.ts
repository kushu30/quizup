import { z } from 'zod';
import { ROSTER_MAX_ENTRIES, rosterStudentInputSchema } from './roster.js';

export const GROUP_NAME_MAX_LENGTH = 60;
export const GROUPS_MAX_PER_HOST = 100;

export const groupSaveSchema = z
  .object({
    name: z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH),
    students: z
      .array(rosterStudentInputSchema)
      .max(ROSTER_MAX_ENTRIES)
      .superRefine((students, context) => {
        const seen = new Set<string>();
        for (const [index, student] of students.entries()) {
          const key = student.displayName.toLowerCase();
          if (seen.has(key)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, 'displayName'],
              message: `${student.displayName} appears more than once`,
            });
          }
          seen.add(key);
        }
      }),
  })
  .strict();
export type GroupSaveInput = z.infer<typeof groupSaveSchema>;

export const groupSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  memberCount: z.number().int().nonnegative(),
});
export type GroupSummary = z.infer<typeof groupSummarySchema>;

export const groupListSchema = z.array(groupSummarySchema);

export const groupDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  students: z.array(z.object({ displayName: z.string(), email: z.string().nullable() })),
});
export type GroupDetail = z.infer<typeof groupDetailSchema>;

export const groupIdParamsSchema = z.object({ groupId: z.string().uuid() });

/** Converts a saved group's members into the input the session roster accepts. */
export function groupStudentsToRosterInput(group: GroupDetail) {
  return group.students.map((student) =>
    student.email
      ? { displayName: student.displayName, email: student.email }
      : { displayName: student.displayName },
  );
}
