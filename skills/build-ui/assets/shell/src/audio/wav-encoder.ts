const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

function writeTag(view: DataView, offset: number, tag: string) {
  for (let index = 0; index < tag.length; index += 1) {
    view.setUint8(offset + index, tag.charCodeAt(index));
  }
}

function writePcm16Header(view: DataView, sampleRate: number, channels: number, dataBytes: number) {
  const blockAlign = channels * BYTES_PER_SAMPLE;

  writeTag(view, 0, "RIFF");
  view.setUint32(4, HEADER_BYTES - 8 + dataBytes, true);
  writeTag(view, 8, "WAVE");
  writeTag(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeTag(view, 36, "data");
  view.setUint32(40, dataBytes, true);
}

export function wrapPcm16Wav(frames: ArrayBuffer, sampleRate: number, channels: number): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_BYTES + frames.byteLength);

  writePcm16Header(new DataView(buffer), sampleRate, channels, frames.byteLength);
  new Uint8Array(buffer, HEADER_BYTES).set(new Uint8Array(frames));

  return buffer;
}

function toInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
}

export function encodeMonoPcm16Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  writePcm16Header(view, sampleRate, 1, dataBytes);
  samples.forEach((sample, index) => view.setInt16(HEADER_BYTES + index * BYTES_PER_SAMPLE, toInt16(sample), true));
  return buffer;
}
