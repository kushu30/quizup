import type { FaceDetector } from '@mediapipe/tasks-vision';
import type { FaceBox } from './frameAnalysis';

// Browser glue for the camera: draws the current video frame, measures how bright it is and asks
// MediaPipe's small face detector what it sees. Everything runs on the student's device. Not
// unit-tested (it needs a real camera); the logic around it is, with a fake of this module.

const WASM_PATH = '/proctor/wasm';
const MODEL_PATH = '/proctor/blaze_face_short_range.tflite';
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;
const BRIGHTNESS_WIDTH = 16;
const BRIGHTNESS_HEIGHT = 12;

export interface FaceSample {
  faces: FaceBox[];
  /** Mean brightness, 0 to 255. */
  brightness: number;
}

export interface FaceSampler {
  /** Null while the video has no picture yet. */
  sample(): FaceSample | null;
  stop(): void;
}

let detectorPromise: Promise<FaceDetector> | null = null;

// Loaded on first use, so the detector code and wasm only reach students whose host turned the
// camera on.
function loadDetector(): Promise<FaceDetector> {
  detectorPromise ??= (async () => {
    const { FaceDetector: Detector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    return Detector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
    });
  })();
  detectorPromise.catch(() => {
    detectorPromise = null;
  });
  return detectorPromise;
}

export async function createFaceSampler(stream: MediaStream): Promise<FaceSampler | null> {
  const detector = await loadDetector();

  const frame = document.createElement('canvas');
  frame.width = FRAME_WIDTH;
  frame.height = FRAME_HEIGHT;
  const frameContext = frame.getContext('2d', { willReadFrequently: true });
  const small = document.createElement('canvas');
  small.width = BRIGHTNESS_WIDTH;
  small.height = BRIGHTNESS_HEIGHT;
  const smallContext = small.getContext('2d', { willReadFrequently: true });
  if (!frameContext || !smallContext) {
    return null;
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream(stream.getVideoTracks());
  await video.play().catch(() => undefined);

  return {
    sample() {
      if (video.readyState < 2 || video.videoWidth === 0) {
        return null;
      }
      frameContext.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      smallContext.drawImage(frame, 0, 0, BRIGHTNESS_WIDTH, BRIGHTNESS_HEIGHT);
      const pixels = smallContext.getImageData(0, 0, BRIGHTNESS_WIDTH, BRIGHTNESS_HEIGHT).data;
      let total = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        total +=
          0.299 * (pixels[index] ?? 0) +
          0.587 * (pixels[index + 1] ?? 0) +
          0.114 * (pixels[index + 2] ?? 0);
      }
      const brightness = total / (pixels.length / 4);
      const { detections } = detector.detect(frame);
      return {
        faces: detections.map((detection) => ({
          keypoints: detection.keypoints.map((keypoint) => ({ x: keypoint.x, y: keypoint.y })),
        })),
        brightness,
      };
    },
    stop() {
      video.pause();
      video.srcObject = null;
    },
  };
}
