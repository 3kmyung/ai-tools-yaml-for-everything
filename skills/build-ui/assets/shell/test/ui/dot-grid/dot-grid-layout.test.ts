import { describe, expect, it } from "vitest";
import { measureGrid, speakingLight, waitingLight } from "../../../src/ui/dot-grid/dot-grid-layout";

describe("measureGrid", () => {
  it("fits whole dots and centers the leftover space", () => {
    expect(measureGrid(105, 72, 10)).toEqual({ columns: 10, rows: 7, offsetX: 7.5, offsetY: 6 });
  });

  it("keeps at least one dot in a canvas smaller than the spacing", () => {
    expect(measureGrid(4, 4, 10)).toMatchObject({ columns: 1, rows: 1 });
  });
});

describe("speakingLight", () => {
  const grid = measureGrid(110, 70, 10);

  it("leaves every dot dark in silence", () => {
    expect(speakingLight(5, 3, grid, [0, 0, 0])).toBe(0);
    expect(speakingLight(5, 3, grid, [])).toBe(0);
  });

  it("lights the middle before the edges", () => {
    const levels = [0.4, 0.2, 0];
    expect(speakingLight(5, 3, grid, levels)).toBe(1);
    expect(speakingLight(5, 0, grid, levels)).toBe(0);
    expect(speakingLight(0, 3, grid, levels)).toBe(0);
  });
});

describe("waitingLight", () => {
  const grid = measureGrid(110, 70, 10);

  it("stays within 0..1 and moves over time", () => {
    const now = waitingLight(3, 2, grid, 0);
    const later = waitingLight(3, 2, grid, 0.5);
    expect(now).toBeGreaterThanOrEqual(0);
    expect(now).toBeLessThanOrEqual(1);
    expect(later).not.toBe(now);
  });
});
