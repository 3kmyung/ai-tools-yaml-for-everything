import { DOT_SPACING, type Grid } from "./dot-grid-layout";

const REST_ALPHA = 0.16;
const REST_RADIUS = 1.4;
const LIT_RADIUS = 3;
const REGION_ALPHA = 0.08;
const REGION_RADIUS = 6;

export type DotLight = (column: number, row: number) => number;

export interface CanvasSize {
  width: number;
  height: number;
}

export interface FractionRegion {
  start: number;
  end: number;
}

function drawRow(context: CanvasRenderingContext2D, grid: Grid, row: number, light: DotLight) {
  const y = grid.offsetY + row * DOT_SPACING;
  for (let column = 0; column < grid.columns; column += 1) {
    const lit = light(column, row);
    context.globalAlpha = REST_ALPHA + (1 - REST_ALPHA) * lit;
    context.beginPath();
    context.arc(grid.offsetX + column * DOT_SPACING, y, REST_RADIUS + (LIT_RADIUS - REST_RADIUS) * lit, 0, Math.PI * 2);
    context.fill();
  }
}

function drawRegions(context: CanvasRenderingContext2D, size: CanvasSize, regions: readonly FractionRegion[]) {
  context.globalAlpha = REGION_ALPHA;
  for (const region of regions) {
    const left = Math.max(0, region.start) * size.width;
    const right = Math.min(1, region.end) * size.width;
    if (right <= left) continue;
    context.beginPath();
    context.roundRect(left, 0, right - left, size.height, REGION_RADIUS);
    context.fill();
  }
}

export function readInkColor(context: CanvasRenderingContext2D): string {
  return getComputedStyle(context.canvas).color;
}

export function drawDotGrid(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  grid: Grid,
  color: string,
  light: DotLight,
  regions: readonly FractionRegion[] = [],
) {
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = color;
  drawRegions(context, size, regions);
  for (let row = 0; row < grid.rows; row += 1) drawRow(context, grid, row, light);
  context.globalAlpha = 1;
}
