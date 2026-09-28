const PEAK_BIN_COUNT = 72;

function binPeak(samples: Float32Array, start: number, end: number): number {
  let peak = 0;
  for (let index = start; index < end; index += 1) {
    peak = Math.max(peak, Math.abs(samples[index] ?? 0));
  }
  return peak;
}

export function computePeaks(samples: Float32Array, binCount: number = PEAK_BIN_COUNT): number[] {
  if (samples.length === 0) return new Array<number>(binCount).fill(0);
  const binSize = samples.length / binCount;
  const raw = Array.from({ length: binCount }, (_, bin) => {
    const start = Math.floor(bin * binSize);
    const end = Math.max(Math.floor((bin + 1) * binSize), start + 1);
    return binPeak(samples, start, end);
  });
  const loudest = Math.max(...raw);
  if (loudest === 0) return raw;
  return raw.map((peak) => Math.round((peak / loudest) * 100) / 100);
}
