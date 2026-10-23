import { z } from 'zod';
import { questionImagePayloadShape } from './questionImage.js';
import { createSeededRandom, shuffleInPlace } from './sampling.js';
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

export const EXAM_CONSENT_MEDIA_VERSION = 'exam-consent-2026-10-media-v1';

export function consentVersionFor(media: { camera: boolean; mic: boolean }): string {
  return media.camera || media.mic ? EXAM_CONSENT_MEDIA_VERSION : EXAM_CONSENT_VERSION;
}

export function proctorLimitSentence(limit: number): string {
  return `If you are flagged ${limit} times, your exam is submitted automatically.`;
}

/** Extra consent lines, shown only for the devices the host turned on. */
export const EXAM_CONSENT_MEDIA_TEXT = {
  camera: [
    'Your camera is used on your device to notice no face in view, several faces, turning away or a blocked camera',
  ],
  mic: ['Your microphone is used on your device to notice loud or continuous sound'],
  notRecorded: [
    'No video or audio is recorded, uploaded or streamed',
    'Only the type and time of a flag is sent to your host',
  ],
} as const;

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

/** Camera and microphone flags. Only these count toward the auto-submit limit. */
export const PROCTOR_SERIOUS_TYPES = [
  'face_missing',
  'multiple_faces',
  'looking_away',
  'camera_blocked',
  'loud_audio',
] as const;
export const proctorSeriousTypeSchema = z.enum(PROCTOR_SERIOUS_TYPES);
export type ProctorSeriousType = z.infer<typeof proctorSeriousTypeSchema>;

export const PROCTOR_COUNTED_TYPES = [
  'tab_switch',
  'window_blur',
  'fullscreen_exit',
  'copy',
  'paste',
  'right_click',
  'resize',
  ...PROCTOR_SERIOUS_TYPES,
  // Sent the moment a face leaves the frame, before the 3 s that make it a flag. It shows in the
  // host's totals but does not count toward the auto-submit limit.
  'face_left',
] as const;

export const PROCTOR_FLAG_LIMIT = { min: 3, max: 50, suggested: 10 } as const;

export const sessionStartSchema = z
  .object({
    proctored: z.boolean().optional(),
    proctorCamera: z.boolean().optional(),
    proctorMic: z.boolean().optional(),
    proctorFlagLimit: z
      .number()
      .int()
      .min(PROCTOR_FLAG_LIMIT.min)
      .max(PROCTOR_FLAG_LIMIT.max)
      .optional(),
  })
  .strict();
export type SessionStartInput = z.infer<typeof sessionStartSchema>;

export const proctorCountedTypeSchema = z.enum(PROCTOR_COUNTED_TYPES);
export type ProctorCountedType = z.infer<typeof proctorCountedTypeSchema>;

export const PROCTOR_RECORD_TYPES = [
  ...PROCTOR_COUNTED_TYPES,
  'focus_return',
  'consent_given',
  'camera_lost',
  'camera_denied',
  'mic_lost',
  'mic_denied',
  'auto_submitted',
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
  face_missing: 'No face in view',
  multiple_faces: 'Several faces',
  looking_away: 'Looking away',
  camera_blocked: 'Camera blocked',
  loud_audio: 'Loud sound',
  face_left: 'Face left the frame',
  camera_lost: 'Camera lost',
  camera_denied: 'Camera denied',
  mic_lost: 'Microphone lost',
  mic_denied: 'Microphone denied',
  auto_submitted: 'Auto-submitted by proctoring',
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
    face_missing: 0,
    multiple_faces: 0,
    looking_away: 0,
    camera_blocked: 0,
    loud_audio: 0,
    face_left: 0,
  };
}

export function seriousFlagCount(counts: ProctorCounts): number {
  return PROCTOR_SERIOUS_TYPES.reduce((sum, type) => sum + counts[type], 0);
}

export const proctorCountsSchema = z.object({
  tab_switch: z.number().int().nonnegative(),
  window_blur: z.number().int().nonnegative(),
  fullscreen_exit: z.number().int().nonnegative(),
  copy: z.number().int().nonnegative(),
  paste: z.number().int().nonnegative(),
  right_click: z.number().int().nonnegative(),
  resize: z.number().int().nonnegative(),
  // Optional in stored data from before camera and mic proctoring existed.
  face_missing: z.number().int().nonnegative().default(0),
  multiple_faces: z.number().int().nonnegative().default(0),
  looking_away: z.number().int().nonnegative().default(0),
  camera_blocked: z.number().int().nonnegative().default(0),
  loud_audio: z.number().int().nonnegative().default(0),
  face_left: z.number().int().nonnegative().default(0),
});

export function totalProctorCount(counts: ProctorCounts): number {
  return PROCTOR_COUNTED_TYPES.reduce((sum, type) => sum + counts[type], 0);
}

const clientAtSchema = z.number().int().positive();
const lengthSchema = z.number().int().min(0).max(10_000_000);
const dimensionSchema = z.number().int().min(0).max(20_000);
const awayDurationSchema = z.number().int().min(0).max(86_400_000);

export const proctorEventPayloadSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: proctorSeriousTypeSchema,
      clientAt: clientAtSchema,
      detail: z.object({ continued: z.boolean() }).strict().optional(),
    })
    .strict(),
  z
    .object({
      type: z.enum(['camera_lost', 'camera_denied', 'mic_lost', 'mic_denied', 'face_left']),
      clientAt: clientAtSchema,
    })
    .strict(),
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
  ...questionImagePayloadShape,
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
  autoSubmitted: z.boolean().default(false),
});
export type ExamProgressRow = z.infer<typeof examProgressRowSchema>;

export const examProgressPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  serverNowMs: z.number(),
  resultsReleased: z.boolean(),
  rows: z.array(examProgressRowSchema),
});
export type ExamProgressPayload = z.infer<typeof examProgressPayloadSchema>;

export const examSubmitReasonSchema = z.enum([
  'student',
  'deadline',
  'host_ended',
  'proctor_limit',
]);
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
