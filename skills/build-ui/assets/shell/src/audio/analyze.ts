import { computePeaks } from "./peaks";

export const DECODE_SAMPLE_RATE = 24000;

export interface AudioAnalysis {
  durationSeconds: number;
  peaks: number[];
}

export async function decodeAudio(blob: Blob, sampleRate: number = DECODE_SAMPLE_RATE): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(1, 1, sampleRate);
  return context.decodeAudioData(await blob.arrayBuffer());
}

export async function analyzeAudio(blob: Blob): Promise<AudioAnalysis> {
  const buffer = await decodeAudio(blob);
  return { durationSeconds: buffer.duration, peaks: computePeaks(buffer.getChannelData(0)) };
}
