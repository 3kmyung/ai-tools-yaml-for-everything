import { decodeAudio } from "./analyze";
import { encodeMonoPcm16Wav } from "./wav-encoder";

export const RECORDING_SAMPLE_RATE = 48000;

export const WAV_MIME = "audio/wav";

export async function toMonoWav(source: Blob): Promise<Blob> {
  const decoded = await decodeAudio(source, RECORDING_SAMPLE_RATE);
  const frameCount = Math.max(1, Math.ceil(decoded.duration * RECORDING_SAMPLE_RATE));
  const context = new OfflineAudioContext(1, frameCount, RECORDING_SAMPLE_RATE);
  const node = context.createBufferSource();
  node.buffer = decoded;
  node.connect(context.destination);
  node.start();
  const rendered = await context.startRendering();
  return new Blob([encodeMonoPcm16Wav(rendered.getChannelData(0), RECORDING_SAMPLE_RATE)], { type: WAV_MIME });
}
