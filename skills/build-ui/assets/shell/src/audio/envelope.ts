const ATTACK = 0.5;
const RELEASE = 0.08;
const VOICE_LOW_HERTZ = 80;
const VOICE_HIGH_HERTZ = 4000;

export function followEnvelope(current: number, target: number): number {
  const rate = target > current ? ATTACK : RELEASE;
  return current + (target - current) * rate;
}

export interface BinRange {
  firstBin: number;
  endBin: number;
}

export function voiceBinRange(sampleRate: number, binCount: number): BinRange {
  const hertzPerBin = sampleRate / 2 / binCount;
  const firstBin = Math.min(Math.floor(VOICE_LOW_HERTZ / hertzPerBin), binCount - 1);
  const endBin = Math.min(Math.ceil(VOICE_HIGH_HERTZ / hertzPerBin), binCount);
  return { firstBin, endBin: Math.max(endBin, firstBin + 1) };
}

function averageBins(frequencies: Uint8Array, start: number, end: number): number {
  let sum = 0;
  for (let bin = start; bin < end; bin += 1) sum += frequencies[bin] ?? 0;
  return sum / (end - start) / 255;
}

export function bandLevels(frequencies: Uint8Array, range: BinRange, bandCount: number): number[] {
  const span = (range.endBin - range.firstBin) / bandCount;
  return Array.from({ length: bandCount }, (_, band) => {
    const start = range.firstBin + Math.floor(band * span);
    const end = Math.max(range.firstBin + Math.floor((band + 1) * span), start + 1);
    return averageBins(frequencies, start, end);
  });
}
