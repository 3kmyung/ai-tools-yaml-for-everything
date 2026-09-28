import { describe, expect, it } from "vitest";
import { computePeaks } from "../../../src/audio/peaks";
import { measureGrid } from "../../../src/ui/dot-grid/dot-grid-layout";
import { resamplePeaks, toFractionRegions, waveformLight } from "../../../src/ui/dot-grid/waveform-light";

describe("resamplePeaks", () => {
  it("stretches the peaks over the columns, keeping both ends", () => {
    expect(resamplePeaks([0, 1], 3)).toEqual([0, 0.5, 1]);
  });

  it("gives silence for no peaks and the first peak for one column", () => {
    expect(resamplePeaks([], 2)).toEqual([0, 0]);
    expect(resamplePeaks([0.4, 1], 1)).toEqual([0.4]);
  });
});

describe("toFractionRegions", () => {
  it("places seconds on the width of the audio", () => {
    expect(toFractionRegions([{ start: 2, end: 3 }], 8)).toEqual([{ start: 0.25, end: 0.375 }]);
  });

  it("draws nothing before the duration is known", () => {
    expect(toFractionRegions([{ start: 2, end: 3 }], 0)).toEqual([]);
    expect(toFractionRegions([{ start: 2, end: 3 }], Number.NaN)).toEqual([]);
  });
});

describe("waveformLight", () => {
  const grid = measureGrid(110, 70, 10);
  const middleRow = 3;
  const flat = { heights: new Array<number>(grid.columns).fill(0.5), progress: 0.5, levels: [] };

  it("draws the played part darker than the part ahead", () => {
    expect(waveformLight(0, middleRow, grid, flat)).toBe(1);
    expect(waveformLight(10, middleRow, grid, flat)).toBeCloseTo(0.6);
  });

  it("draws silence clearly lower than tone before playback", () => {
    const tone = Float32Array.from({ length: 400 }, (_, index) => (index % 2 === 0 ? 0.5 : -0.5));
    const samples = new Float32Array(1000);
    samples.set(tone, 0);
    samples.set(tone, 600);
    const peaks = computePeaks(samples, 10);
    const unplayed = { heights: resamplePeaks(peaks, grid.columns), progress: 0, levels: [] };
    const toneColumn = 1;
    const silenceColumn = 5;
    const upperRow = 1;

    expect(peaks.slice(3, 7)).toEqual([1, 0, 0, 1]);
    expect(waveformLight(toneColumn, upperRow, grid, unplayed)).toBeGreaterThanOrEqual(0.5);
    expect(waveformLight(silenceColumn, upperRow, grid, unplayed)).toBe(0);
    expect(waveformLight(silenceColumn, middleRow, grid, unplayed)).toBeLessThan(waveformLight(toneColumn, middleRow, grid, unplayed) / 2);
  });

  it("swells the columns around the playhead only while a voice is heard", () => {
    const silent = { heights: new Array<number>(grid.columns).fill(0), progress: 0.5, levels: [] };
    const voiced = { ...silent, levels: [1, 1] };
    expect(waveformLight(5, 0, grid, silent)).toBe(0);
    expect(waveformLight(5, 0, grid, voiced)).toBeGreaterThan(0);
    expect(waveformLight(0, 0, grid, voiced)).toBe(0);
  });
});
