import { measureGrid, speakingLight, waitingLight, type DotGridState } from "./dot-grid-layout";
import { DotCanvas } from "./DotCanvas";
import { drawDotGrid, readInkColor, type DotLight } from "./draw-dot-grid";
import type { FramePainter } from "./use-canvas-animation";

interface DotGridProps {
  state: DotGridState;
  readLevels?: () => readonly number[];
  className?: string;
}

function createPainter(state: DotGridState, readLevels: DotGridProps["readLevels"]): FramePainter {
  return (context, size, timeSeconds) => {
    const grid = measureGrid(size.width, size.height);
    const levels = state === "speaking" && readLevels ? readLevels() : [];
    const light: DotLight =
      state === "waiting"
        ? (column, row) => waitingLight(column, row, grid, timeSeconds)
        : (column, row) => speakingLight(column, row, grid, levels);
    drawDotGrid(context, size, grid, readInkColor(context), light);
  };
}

export function DotGrid({ state, readLevels, className }: DotGridProps) {
  return <DotCanvas aria-hidden paint={createPainter(state, readLevels)} isAnimated={state !== "idle"} className={className} />;
}
