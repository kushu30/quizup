import { z } from 'zod';
import { createSeededRandom } from './sampling.js';
import { QUESTION_OPTION_COUNT } from './tables.js';

export const EXAM_CONSENT_VERSION = 'exam-consent-2026-10-v1';
export const PROCTOR_EVENT_RATE_PER_SECOND = 20;
export const PROCTOR_CLIENT_QUEUE_LIMIT = 200;
export const PROCTOR_LATE_AFTER_MS = 5000;
export const PROCTOR_FLUSH_INTERVAL_MS = 200;
export const PROCTOR_RESIZE_DEBOUNCE_MS = 500;
export const PROCTOR_RESIZE_MIN_DELTA_PX = 20;
export const PROCTOR_EVENT_BADGE_THRESHOLD = 5;
export const EXAM_PROGRESS_THROTTLE_MS = 250;
export const EXAM_SWEEP_INTERVAL_MS = 1000;
export const EXAM_POINTS_PER_QUESTION = 1;

export const EXAM_CONSENT_TEXT = {
  title: 'Before you start this exam',
  monitoredHeading: 'What is monitored during the exam',
  monitored: [
    'Switching to another browser tab',
    'The exam window losing focus',
    'Leaving full screen',
    'Copy, cut and paste actions (only the length of the text, never the text itself)',
    'Right-clicks',
    'Resizing the browser window',
    'The time each of these happened',
  ],
  notCollectedHeading: 'What is NOT collected',
  notCollected: [
    'No webcam',
    'No microphone',
    'No screen recording',
    'No keystrokes',
    'No clipboard content',
  ],
  statementsHeading: 'How this is used',
  statements: [
    'These signals are shown to your host and kept together with your results.',
    'They are indicators only. They are not proof of misconduct.',
    'Your timer starts as soon as you accept.',
  ],
  acceptLabel: 'Accept and start the exam',
  declineLabel: 'Decline and go back',
} as const;

export const PROCTOR_COUNTED_TYPES = [
  'tab_switch',
  'window_blur',
  'fullscreen_exit',
  'copy',
  'paste',
  'right_click',
  'resize',
] as const;
export const sessionStartSchema = z.object({ proctored: z.boolean().optional() }).strict();
export type SessionStartInput = z.infer<typeof sessionStartSchema>;

export const proctorCountedTypeSchema = z.enum(PROCTOR_COUNTED_TYPES);
export type ProctorCountedType = z.infer<typeof proctorCountedTypeSchema>;

export const PROCTOR_RECORD_TYPES = [
  ...PROCTOR_COUNTED_TYPES,
  'focus_return',
  'consent_given',
] as const;
export const proctorRecordTypeSchema = z.enum(PROCTOR_RECORD_TYPES);
export type ProctorRecordType = z.infer<typeof proctorRecordTypeSchema>;

export const PROCTOR_TYPE_LABELS: Record<ProctorRecordType, string> = {
  tab_switch: 'Tab switch',
  window_blur: 'Window focus lost',
  fullscreen_exit: 'Left full screen',
  copy: 'Copy or cut',
  paste: 'Paste',
  right_click: 'Right-click',
  resize: 'Window resize',
  focus_return: 'Returned',
  consent_given: 'Consent given',
};

export type ProctorCounts = Record<ProctorCountedType, number>;

export function emptyProctorCounts(): ProctorCounts {
  return {
    tab_switch: 0,
    window_blur: 0,
    fullscreen_exit: 0,
    copy: 0,
    paste: 0,
    right_click: 0,
    resize: 0,
  };
}

export const proctorCountsSchema = z.object({
  tab_switch: z.number().int().nonnegative(),
  window_blur: z.number().int().nonnegative(),
  fullscreen_exit: z.number().int().nonnegative(),
  copy: z.number().int().nonnegative(),
  paste: z.number().int().nonnegative(),
  right_click: z.number().int().nonnegative(),
  resize: z.number().int().nonnegative(),
});

export function totalProctorCount(counts: ProctorCounts): number {
  return PROCTOR_COUNTED_TYPES.reduce((sum, type) => sum + counts[type], 0);
}

const clientAtSchema = z.number().int().positive();
const lengthSchema = z.number().int().min(0).max(10_000_000);
const dimensionSchema = z.number().int().min(0).max(20_000);
const awayDurationSchema = z.number().int().min(0).max(86_400_000);

export const proctorEventPayloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tab_switch'), clientAt: clientAtSchema }).strict(),
  z.object({ type: z.literal('window_blur'), clientAt: clientAtSchema }).strict(),
  z.object({ type: z.literal('fullscreen_exit'), clientAt: clientAtSchema }).strict(),
  z.object({ type: z.literal('right_click'), clientAt: clientAtSchema }).strict(),
  z
    .object({
      type: z.literal('focus_return'),
      clientAt: clientAtSchema,
      detail: z
        .object({
          durationMs: awayDurationSchema,
          from: z.enum(['tab_switch', 'window_blur']),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('copy'),
      clientAt: clientAtSchema,
      detail: z.object({ length: lengthSchema, cut: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('paste'),
      clientAt: clientAtSchema,
      detail: z.object({ length: lengthSchema }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('resize'),
      clientAt: clientAtSchema,
      detail: z.object({ width: dimensionSchema, height: dimensionSchema }).strict(),
    })
    .strict(),
]);
export type ProctorEventPayload = z.infer<typeof proctorEventPayloadSchema>;

export const proctorEventRecordSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  participantId: z.string().uuid(),
  attemptId: z.string().uuid().nullable(),
  type: proctorRecordTypeSchema,
  clientAt: z.number(),
  serverAt: z.number(),
  late: z.boolean(),
  detail: z.record(z.string(), z.unknown()).nullable(),
});
export type ProctorEventRecord = z.infer<typeof proctorEventRecordSchema>;

export const proctorParticipantTimelineSchema = z.object({
  participantId: z.string().uuid(),
  displayName: z.string(),
  attemptStartedAtMs: z.number().nullable(),
  counts: proctorCountsSchema,
  droppedEvents: z.number().int().nonnegative(),
  events: z.array(proctorEventRecordSchema),
});
export type ProctorParticipantTimeline = z.infer<typeof proctorParticipantTimelineSchema>;
export const proctorTimelineResponseSchema = z.array(proctorParticipantTimelineSchema);

export const examQuestionViewSchema = z.object({
  questionId: z.string().uuid(),
  stem: z.string(),
  options: z.array(z.string()).length(QUESTION_OPTION_COUNT),
});
export type ExamQuestionView = z.infer<typeof examQuestionViewSchema>;

export const examPhaseSchema = z.enum(['waiting', 'consent', 'in_progress', 'submitted', 'closed']);
export type ExamPhase = z.infer<typeof examPhaseSchema>;

export const examStudentViewSchema = z.object({
  phase: examPhaseSchema,
  durationMinutes: z.number().int().positive(),
  consentVersion: z.string(),
  attempt: z
    .object({
      attemptId: z.string().uuid(),
      startedAtServerMs: z.number(),
      deadlineAtServerMs: z.number(),
      submittedAtServerMs: z.number().nullable(),
    })
    .nullable(),
  questions: z.array(examQuestionViewSchema),
  answers: z.record(
    z.string(),
    z
      .number()
      .int()
      .min(0)
      .max(QUESTION_OPTION_COUNT - 1),
  ),
  resultsReleased: z.boolean(),
});
export type ExamStudentView = z.infer<typeof examStudentViewSchema>;

export const examProgressStatusSchema = z.enum(['not_started', 'in_progress', 'submitted']);
export type ExamProgressStatus = z.infer<typeof examProgressStatusSchema>;

export const examProgressRowSchema = z.object({
  participantId: z.string().uuid(),
  displayName: z.string(),
  status: examProgressStatusSchema,
  answered: z.number().int().nonnegative(),
  totalQuestions: z.number().int().nonnegative(),
  startedAtServerMs: z.number().nullable(),
  deadlineAtServerMs: z.number().nullable(),
  proctorEventCount: z.number().int().nonnegative(),
  droppedEvents: z.number().int().nonnegative(),
  score: z.number().int().nonnegative().nullable(),
});
export type ExamProgressRow = z.infer<typeof examProgressRowSchema>;

export const examProgressPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  serverNowMs: z.number(),
  resultsReleased: z.boolean(),
  rows: z.array(examProgressRowSchema),
});
export type ExamProgressPayload = z.infer<typeof examProgressPayloadSchema>;

export const examSubmitReasonSchema = z.enum(['student', 'deadline', 'host_ended']);
export type ExamSubmitReason = z.infer<typeof examSubmitReasonSchema>;

export const examResultQuestionSchema = z.object({
  questionId: z.string().uuid(),
  stem: z.string(),
  chosenOption: z.string().nullable(),
  chosenIndex: z
    .number()
    .int()
    .min(0)
    .max(QUESTION_OPTION_COUNT - 1)
    .nullable(),
  correct: z.boolean().nullable(),
});
export type ExamResultQuestion = z.infer<typeof examResultQuestionSchema>;

export const examResultsSchema = z.object({
  score: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  questions: z.array(examResultQuestionSchema),
});
export type ExamResults = z.infer<typeof examResultsSchema>;

export const examStartPayloadSchema = z
  .object({ consentVersion: z.string().min(1).max(100) })
  .strict();
export type ExamStartPayload = z.infer<typeof examStartPayloadSchema>;

export const examAnswerPayloadSchema = z
  .object({
    questionId: z.string().uuid(),
    displayedIndex: z
      .number()
      .int()
      .min(0)
      .max(QUESTION_OPTION_COUNT - 1),
  })
  .strict();
export type ExamAnswerPayload = z.infer<typeof examAnswerPayloadSchema>;

export const examEmptyPayloadSchema = z.object({}).strict();

export interface ExamOrders {
  questionOrder: string[];
  optionOrders: Record<string, number[]>;
}

function shuffleInPlace<Item>(items: Item[], next: () => number): Item[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    const held = items[index] as Item;
    items[index] = items[swapIndex] as Item;
    items[swapIndex] = held;
  }
  return items;
}

export function buildExamOrders(
  seed: number,
  questionIds: readonly string[],
  optionCount: number = QUESTION_OPTION_COUNT,
): ExamOrders {
  const random = createSeededRandom(seed);
  const next = () => random.next();
  const questionOrder = shuffleInPlace([...questionIds], next);
  const optionOrders: Record<string, number[]> = {};
  for (const questionId of questionIds) {
    optionOrders[questionId] = shuffleInPlace(
      Array.from({ length: optionCount }, (_, index) => index),
      next,
    );
  }
  return { questionOrder, optionOrders };
}

export function displayedToOriginalIndex(
  optionOrder: readonly number[],
  displayedIndex: number,
): number | null {
  return optionOrder[displayedIndex] ?? null;
}

export function originalToDisplayedIndex(
  optionOrder: readonly number[],
  originalIndex: number,
): number | null {
  const position = optionOrder.indexOf(originalIndex);
  return position === -1 ? null : position;
}

export const releaseResultsResponseSchema = z.object({ releasedAtMs: z.number() });
export type ReleaseResultsResponse = z.infer<typeof releaseResultsResponseSchema>;
