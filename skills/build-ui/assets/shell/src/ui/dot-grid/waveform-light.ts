import { lightUpTo, sampleBands, type Grid } from "./dot-grid-layout";
import type { FractionRegion } from "./draw-dot-grid";

const QUIET_HEIGHT = 0.12;
const UNPLAYED_LIGHT = 0.6;
const SWELL_REACH_COLUMNS = 7;
const SWELL_GAIN = 1.2;

export interface WaveformFrame {
  heights: readonly number[];
  progress: number;
  levels: readonly number[];
}

export interface TimeRegion {
  start: number;
  end: number;
}

export function resamplePeaks(peaks: readonly number[], columns: number): number[] {
  return Array.from({ length: columns }, (_, column) => sampleBands(peaks, columns > 1 ? column / (columns - 1) : 0));
}

export function toFractionRegions(regions: readonly TimeRegion[], duration: number): FractionRegion[] {
  if (!(duration > 0)) return [];
  return regions.map((region) => ({ start: region.start / duration, end: region.end / duration }));
}

function swellHeight(column: number, playheadColumn: number, levels: readonly number[]): number {
  const distance = Math.abs(column - playheadColumn) / SWELL_REACH_COLUMNS;
  if (distance >= 1 || levels.length === 0) return 0;
  return sampleBands(levels, distance) * SWELL_GAIN * (1 - distance * distance);
}

export function waveformLight(column: number, row: number, grid: Grid, frame: WaveformFrame): number {
  const height = QUIET_HEIGHT + (frame.heights[column] ?? 0) * (1 - QUIET_HEIGHT);
  const isPlayed = (column + 0.5) / grid.columns <= frame.progress;
  const shape = lightUpTo(height, row, grid.rows) * (isPlayed ? 1 : UNPLAYED_LIGHT);
  const swell = lightUpTo(swellHeight(column, frame.progress * grid.columns, frame.levels), row, grid.rows);
  return Math.max(shape, swell);
}
