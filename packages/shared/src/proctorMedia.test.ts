import { describe, expect, it } from 'vitest';
import {
  EXAM_CONSENT_VERSION,
  PROCTOR_COUNTED_TYPES,
  PROCTOR_RECORD_TYPES,
  PROCTOR_SERIOUS_TYPES,
  PROCTOR_TYPE_LABELS,
  consentVersionFor,
  emptyProctorCounts,
  proctorEventPayloadSchema,
  proctorLimitSentence,
  seriousFlagCount,
  sessionStartSchema,
} from './exam.js';

describe('seriousFlagCount', () => {
  it('sums only the five serious types', () => {
    const counts = emptyProctorCounts();
    counts.tab_switch = 9;
    counts.face_missing = 2;
    counts.loud_audio = 1;
    expect(seriousFlagCount(counts)).toBe(3);
  });

  it('has a count slot for every serious type', () => {
    const counts = emptyProctorCounts();
    for (const type of PROCTOR_SERIOUS_TYPES) {
      expect(counts[type]).toBe(0);
    }
  });
});

describe('proctorEventPayloadSchema for camera and mic', () => {
  it('accepts serious flags with an optional continued marker', () => {
    expect(
      proctorEventPayloadSchema.safeParse({
        type: 'face_missing',
        clientAt: 1,
        detail: { continued: true },
      }).success,
    ).toBe(true);
    expect(proctorEventPayloadSchema.safeParse({ type: 'loud_audio', clientAt: 1 }).success).toBe(
      true,
    );
  });

  it('accepts lost and denied events without detail', () => {
    for (const type of ['camera_lost', 'camera_denied', 'mic_lost', 'mic_denied']) {
      expect(proctorEventPayloadSchema.safeParse({ type, clientAt: 1 }).success).toBe(true);
    }
  });

  it('refuses a client-sent auto_submitted and unknown detail', () => {
    expect(
      proctorEventPayloadSchema.safeParse({ type: 'auto_submitted', clientAt: 1 }).success,
    ).toBe(false);
    expect(
      proctorEventPayloadSchema.safeParse({ type: 'face_missing', clientAt: 1, detail: { x: 1 } })
        .success,
    ).toBe(false);
  });
});

describe('sessionStartSchema flag limit', () => {
  it('keeps the limit between 3 and 50', () => {
    expect(sessionStartSchema.safeParse({ proctorFlagLimit: 2 }).success).toBe(false);
    expect(sessionStartSchema.safeParse({ proctorFlagLimit: 51 }).success).toBe(false);
    expect(sessionStartSchema.safeParse({ proctorFlagLimit: 3 }).success).toBe(true);
    expect(sessionStartSchema.safeParse({ proctorFlagLimit: 50 }).success).toBe(true);
  });

  it('accepts the camera and mic choices', () => {
    expect(
      sessionStartSchema.parse({ proctored: true, proctorCamera: true, proctorMic: false }),
    ).toEqual({ proctored: true, proctorCamera: true, proctorMic: false });
  });
});

describe('consent', () => {
  it('uses the old version without media and a different one with it', () => {
    expect(consentVersionFor({ camera: false, mic: false })).toBe(EXAM_CONSENT_VERSION);
    const camera = consentVersionFor({ camera: true, mic: false });
    expect(camera).not.toBe(EXAM_CONSENT_VERSION);
    expect(consentVersionFor({ camera: false, mic: true })).toBe(camera);
    expect(consentVersionFor({ camera: true, mic: true })).toBe(camera);
  });

  it('states the flag limit plainly', () => {
    expect(proctorLimitSentence(10)).toContain('flagged 10 times');
    expect(proctorLimitSentence(10)).toContain('submitted automatically');
  });

  it('labels every record type', () => {
    for (const type of PROCTOR_RECORD_TYPES) {
      expect(PROCTOR_TYPE_LABELS[type]).toBeTruthy();
    }
  });
});

describe('face_left', () => {
  it('is accepted from the browser as a plain event, and counted in the host totals', () => {
    expect(proctorEventPayloadSchema.safeParse({ type: 'face_left', clientAt: 1 }).success).toBe(
      true,
    );
    expect(
      proctorEventPayloadSchema.safeParse({ type: 'face_left', clientAt: 1, detail: {} }).success,
    ).toBe(false);
    expect(PROCTOR_COUNTED_TYPES).toContain('face_left');
    expect(PROCTOR_TYPE_LABELS.face_left).toBe('Face left the frame');
  });

  it('does not count toward the auto-submit limit', () => {
    const counts = emptyProctorCounts();
    counts.face_left = 9;
    counts.face_missing = 1;
    expect(seriousFlagCount(counts)).toBe(1);
    expect(PROCTOR_SERIOUS_TYPES).not.toContain('face_left');
  });
});
