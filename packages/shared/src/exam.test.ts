import { describe, expect, it } from 'vitest';
import {
  EXAM_CONSENT_TEXT,
  EXAM_CONSENT_VERSION,
  PROCTOR_COUNTED_TYPES,
  buildExamOrders,
  displayedToOriginalIndex,
  emptyProctorCounts,
  originalToDisplayedIndex,
  proctorEventPayloadSchema,
  totalProctorCount,
} from './exam.js';

const questionIds = Array.from(
  { length: 10 },
  (_, index) => `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
);

describe('buildExamOrders', () => {
  it('is deterministic for a seed', () => {
    expect(buildExamOrders(12345, questionIds)).toEqual(buildExamOrders(12345, questionIds));
  });

  it('differs across seeds, so students get different orders', () => {
    const orders = [1, 2, 3, 4, 5].map((seed) => buildExamOrders(seed, questionIds).questionOrder);
    const distinct = new Set(orders.map((order) => order.join(',')));
    expect(distinct.size).toBe(orders.length);
    const optionOrders = [1, 2, 3].map((seed) =>
      JSON.stringify(buildExamOrders(seed, questionIds).optionOrders),
    );
    expect(new Set(optionOrders).size).toBe(3);
  });

  it('produces permutations of the questions and of the options', () => {
    for (const seed of [7, 99, 2024, 31337]) {
      const orders = buildExamOrders(seed, questionIds);
      expect([...orders.questionOrder].sort()).toEqual([...questionIds].sort());
      expect(Object.keys(orders.optionOrders).sort()).toEqual([...questionIds].sort());
      for (const optionOrder of Object.values(orders.optionOrders)) {
        expect([...optionOrder].sort()).toEqual([0, 1, 2, 3]);
      }
    }
  });

  it('does not always leave the order unchanged', () => {
    const moved = [11, 12, 13, 14].some((seed) => {
      const orders = buildExamOrders(seed, questionIds);
      return orders.questionOrder.join() !== questionIds.join();
    });
    expect(moved).toBe(true);
  });

  it('maps a displayed option back to the correct original option', () => {
    for (const seed of [3, 4, 5, 6]) {
      const orders = buildExamOrders(seed, questionIds);
      for (const questionId of questionIds) {
        const optionOrder = orders.optionOrders[questionId] as number[];
        for (let originalCorrect = 0; originalCorrect < 4; originalCorrect += 1) {
          const displayed = originalToDisplayedIndex(optionOrder, originalCorrect) as number;
          expect(displayedToOriginalIndex(optionOrder, displayed)).toBe(originalCorrect);
        }
      }
    }
    expect(displayedToOriginalIndex([2, 0, 3, 1], 4)).toBeNull();
    expect(originalToDisplayedIndex([2, 0, 3, 1], 9)).toBeNull();
  });
});

describe('proctorEventPayloadSchema', () => {
  const clientAt = 1_800_000_000_000;

  it('accepts every client event type with its typed detail', () => {
    const valid = [
      { type: 'tab_switch', clientAt },
      { type: 'window_blur', clientAt },
      { type: 'fullscreen_exit', clientAt },
      { type: 'right_click', clientAt },
      { type: 'focus_return', clientAt, detail: { durationMs: 4200, from: 'tab_switch' } },
      { type: 'copy', clientAt, detail: { length: 12, cut: false } },
      { type: 'copy', clientAt, detail: { length: 3, cut: true } },
      { type: 'paste', clientAt, detail: { length: 40 } },
      { type: 'resize', clientAt, detail: { width: 1024, height: 768 } },
    ];
    for (const event of valid) {
      expect(proctorEventPayloadSchema.safeParse(event).success).toBe(true);
    }
  });

  it('rejects unknown types and the server-only consent type', () => {
    expect(proctorEventPayloadSchema.safeParse({ type: 'keystroke', clientAt }).success).toBe(
      false,
    );
    expect(proctorEventPayloadSchema.safeParse({ type: 'consent_given', clientAt }).success).toBe(
      false,
    );
    expect(proctorEventPayloadSchema.safeParse({ clientAt }).success).toBe(false);
  });

  it('rejects oversized detail and detail that carries content', () => {
    expect(
      proctorEventPayloadSchema.safeParse({
        type: 'paste',
        clientAt,
        detail: { length: 20_000_000 },
      }).success,
    ).toBe(false);
    expect(
      proctorEventPayloadSchema.safeParse({
        type: 'paste',
        clientAt,
        detail: { length: 5, text: 'secret pasted content' },
      }).success,
    ).toBe(false);
    expect(
      proctorEventPayloadSchema.safeParse({
        type: 'resize',
        clientAt,
        detail: { width: 99_999, height: 600 },
      }).success,
    ).toBe(false);
    expect(
      proctorEventPayloadSchema.safeParse({
        type: 'copy',
        clientAt,
        detail: { length: 5, cut: false, content: 'x' },
      }).success,
    ).toBe(false);
  });

  it('rejects detail on events that carry none, missing detail, and extra keys', () => {
    expect(
      proctorEventPayloadSchema.safeParse({ type: 'tab_switch', clientAt, detail: { a: 1 } })
        .success,
    ).toBe(false);
    expect(proctorEventPayloadSchema.safeParse({ type: 'paste', clientAt }).success).toBe(false);
    expect(
      proctorEventPayloadSchema.safeParse({ type: 'tab_switch', clientAt, extra: true }).success,
    ).toBe(false);
    expect(proctorEventPayloadSchema.safeParse({ type: 'tab_switch', clientAt: -1 }).success).toBe(
      false,
    );
  });
});

describe('consent text and counts', () => {
  it('has a version and states what is and is not collected', () => {
    expect(EXAM_CONSENT_VERSION.length).toBeGreaterThan(3);
    const everything = JSON.stringify(EXAM_CONSENT_TEXT).toLowerCase();
    for (const phrase of [
      'tab',
      'focus',
      'full screen',
      'copy',
      'right-click',
      'resiz',
      'no webcam',
      'no microphone',
      'no screen recording',
      'no keystrokes',
      'no clipboard content',
      'not proof of misconduct',
      'shown to your host',
    ]) {
      expect(everything).toContain(phrase);
    }
  });

  it('counts the seven browser types and the five camera and mic types', () => {
    expect(PROCTOR_COUNTED_TYPES).toHaveLength(12);
    const counts = emptyProctorCounts();
    counts.tab_switch = 2;
    counts.paste = 3;
    expect(totalProctorCount(counts)).toBe(5);
  });
});
