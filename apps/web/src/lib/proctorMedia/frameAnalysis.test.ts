import { describe, expect, it } from 'vitest';
import { classifyFrame, type FaceBox } from './frameAnalysis';

// BlazeFace keypoint order: right eye, left eye, nose tip, mouth, right ear, left ear.
function face(noseX: number, eyeGap = 0.2): FaceBox {
  const middle = 0.5;
  return {
    keypoints: [
      { x: middle - eyeGap / 2, y: 0.4 },
      { x: middle + eyeGap / 2, y: 0.4 },
      { x: noseX, y: 0.5 },
      { x: 0.5, y: 0.6 },
      { x: 0.35, y: 0.42 },
      { x: 0.65, y: 0.42 },
    ],
  };
}

describe('classifyFrame', () => {
  it('sees no face in an empty bright frame', () => {
    expect(classifyFrame({ faces: [], brightness: 120 })).toEqual({
      faceCount: 0,
      turnedAway: false,
      blocked: false,
    });
  });

  it('counts two faces and does not judge the head turn when there are several', () => {
    const result = classifyFrame({ faces: [face(0.5), face(0.7)], brightness: 120 });
    expect(result.faceCount).toBe(2);
    expect(result.turnedAway).toBe(false);
  });

  it('treats a centred face as facing the screen', () => {
    expect(classifyFrame({ faces: [face(0.5)], brightness: 120 })).toMatchObject({
      faceCount: 1,
      turnedAway: false,
    });
  });

  it('flags a head turned well to one side, in either direction', () => {
    expect(classifyFrame({ faces: [face(0.62)], brightness: 120 }).turnedAway).toBe(true);
    expect(classifyFrame({ faces: [face(0.38)], brightness: 120 }).turnedAway).toBe(true);
  });

  it('allows a small natural head movement', () => {
    expect(classifyFrame({ faces: [face(0.54)], brightness: 120 }).turnedAway).toBe(false);
  });

  it('treats a profile (eyes almost on top of each other) as turned away', () => {
    expect(classifyFrame({ faces: [face(0.5, 0.01)], brightness: 120 }).turnedAway).toBe(true);
  });

  it('does not judge a face with missing keypoints', () => {
    expect(classifyFrame({ faces: [{ keypoints: [] }], brightness: 120 }).turnedAway).toBe(false);
  });

  it('calls a black frame a blocked camera', () => {
    expect(classifyFrame({ faces: [], brightness: 3 }).blocked).toBe(true);
    expect(classifyFrame({ faces: [], brightness: 12 }).blocked).toBe(true);
    expect(classifyFrame({ faces: [], brightness: 40 }).blocked).toBe(false);
  });
});
