import { describe, expect, it } from "vitest";
import { computePeaks } from "../../src/audio/peaks";

describe("computePeaks", () => {
  it("normalizes the loudest bin to 1", () => {
    const samples = new Float32Array([0.1, -0.2, 0.05, -0.5]);
    expect(computePeaks(samples, 2)).toEqual([0.4, 1]);
  });

  it("returns the requested number of bins even for short audio", () => {
    expect(computePeaks(new Float32Array([0.3]), 4)).toHaveLength(4);
  });

  it("returns zeros for silence and for empty audio", () => {
    expect(computePeaks(new Float32Array(8), 4)).toEqual([0, 0, 0, 0]);
    expect(computePeaks(new Float32Array(0), 3)).toEqual([0, 0, 0]);
  });
});
