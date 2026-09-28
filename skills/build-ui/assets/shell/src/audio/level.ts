export function measureRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  const meanSquare = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
  return Math.sqrt(meanSquare);
}
