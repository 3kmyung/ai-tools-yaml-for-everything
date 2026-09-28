import { measureRms } from "./level";

const RECORDER_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"] as const;

export function pickRecorderMime(isSupported: (mimeType: string) => boolean): string | undefined {
  return RECORDER_MIME_CANDIDATES.find((mimeType) => isSupported(mimeType));
}

export interface RecordingSession {
  stop: () => Promise<Blob>;
  cancel: () => void;
  readLevel: () => number;
}

function createLevelMeter(stream: MediaStream) {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const read = () => {
    analyser.getFloatTimeDomainData(samples);
    return Math.min(1, measureRms(samples) * 5);
  };
  return { read, close: () => void context.close() };
}

const RAW_AUDIO: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

export async function startRecording(): Promise<RecordingSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO });
  const mimeType = pickRecorderMime((candidate) => MediaRecorder.isTypeSupported(candidate));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
  const meter = createLevelMeter(stream);
  const release = () => {
    stream.getTracks().forEach((track) => track.stop());
    meter.close();
  };
  recorder.start();

  const stop = () =>
    new Promise<Blob>((resolve) => {
      recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: recorder.mimeType })), { once: true });
      recorder.stop();
      release();
    });
  const cancel = () => {
    if (recorder.state !== "inactive") recorder.stop();
    release();
  };
  return { stop, cancel, readLevel: meter.read };
}
