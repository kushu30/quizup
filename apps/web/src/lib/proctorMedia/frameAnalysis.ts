import { DARK_BRIGHTNESS_MAX, PROFILE_EYE_GAP, TURN_RATIO } from './thresholds';

export interface FaceBox {
  /** Normalised 0 to 1. BlazeFace order: right eye, left eye, nose tip, mouth, right ear, left ear. */
  keypoints: { x: number; y: number }[];
}

export interface FrameState {
  faceCount: number;
  turnedAway: boolean;
  blocked: boolean;
}

function isTurnedAway(face: FaceBox): boolean {
  const [rightEye, leftEye, nose] = face.keypoints;
  if (!rightEye || !leftEye || !nose) {
    return false;
  }
  const eyeGap = Math.abs(leftEye.x - rightEye.x);
  if (eyeGap <= PROFILE_EYE_GAP) {
    return true;
  }
  const eyeMiddle = (leftEye.x + rightEye.x) / 2;
  return Math.abs(nose.x - eyeMiddle) / eyeGap > TURN_RATIO;
}

export function classifyFrame(input: { faces: FaceBox[]; brightness: number }): FrameState {
  const [only] = input.faces;
  return {
    faceCount: input.faces.length,
    turnedAway: input.faces.length === 1 && only !== undefined && isTurnedAway(only),
    blocked: input.brightness <= DARK_BRIGHTNESS_MAX,
  };
}
