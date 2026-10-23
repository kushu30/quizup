import { rmsLevel } from './audioLevel';

// Browser glue for the microphone: a level meter only. There is no recorder and the sound is
// never played or sent anywhere; the meter reads loudness and throws the samples away.

export interface AudioMeter {
  /** Current loudness, 0 to 1. */
  read(): number;
  stop(): void;
}

export function createAudioMeter(stream: MediaStream): AudioMeter | null {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    return null;
  }
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }
  const context = new AudioContextClass();
  void context.resume();
  const source = context.createMediaStreamSource(new MediaStream(audioTracks));
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);

  return {
    read() {
      analyser.getFloatTimeDomainData(buffer);
      return rmsLevel(buffer);
    },
    stop() {
      source.disconnect();
      void context.close();
    },
  };
}
