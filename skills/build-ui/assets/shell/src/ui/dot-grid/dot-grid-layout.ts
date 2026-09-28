export type DotGridState = "idle" | "waiting" | "speaking";

export const DOT_SPACING = 10;
const LEVEL_REACH = 1.15;
const EDGE_SHARPNESS = 3;
const WAVE_SPEED = 3.2;
const WAVE_LENGTH = 0.32;

export interface Grid {
  columns: number;
  rows: number;
  offsetX: number;
  offsetY: number;
}

export function measureGrid(width: number, height: number, spacing: number = DOT_SPACING): Grid {
  const columns = Math.max(1, Math.floor(width / spacing));
  const rows = Math.max(1, Math.floor(height / spacing));
  return {
    columns,
    rows,
    offsetX: (width - (columns - 1) * spacing) / 2,
    offsetY: (height - (rows - 1) * spacing) / 2,
  };
}

function distanceFromMiddle(index: number, count: number): number {
  const half = (count - 1) / 2;
  return half === 0 ? 0 : Math.abs(index - half) / half;
}

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function lightUpTo(height: number, row: number, rows: number): number {
  return clampUnit((height - distanceFromMiddle(row, rows)) * EDGE_SHARPNESS);
}

export function sampleBands(levels: readonly number[], position: number): number {
  if (levels.length === 0) return 0;
  const scaled = position * (levels.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(lower + 1, levels.length - 1);
  const weight = scaled - lower;
  return (levels[lower] ?? 0) * (1 - weight) + (levels[upper] ?? 0) * weight;
}

export function speakingLight(column: number, row: number, grid: Grid, levels: readonly number[]): number {
  const level = sampleBands(levels, distanceFromMiddle(column, grid.columns));
  return lightUpTo(level * LEVEL_REACH, row, grid.rows);
}

export function waitingLight(column: number, row: number, grid: Grid, timeSeconds: number): number {
  const phase = column * WAVE_LENGTH - timeSeconds * WAVE_SPEED;
  const height = 0.4 + 0.22 * Math.sin(phase) + 0.1 * Math.sin(phase * 0.43 + 1.3);
  return lightUpTo(height, row, grid.rows) * 0.7;
}
