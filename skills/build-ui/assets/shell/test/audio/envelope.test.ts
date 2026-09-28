import { describe, expect, it } from "vitest";
import { bandLevels, followEnvelope, voiceBinRange } from "../../src/audio/envelope";

describe("followEnvelope", () => {
  it("rises toward a louder target faster than it falls toward a quieter one", () => {
    const rise = followEnvelope(0, 1);
    const fall = 1 - followEnvelope(1, 0);
    expect(rise).toBeGreaterThan(fall);
    expect(fall).toBeGreaterThan(0);
  });
});

describe("voiceBinRange", () => {
  it("keeps only the bins between 80 Hz and 4 kHz", () => {
    expect(voiceBinRange(48000, 256)).toEqual({ firstBin: 0, endBin: 43 });
    expect(voiceBinRange(24000, 1024)).toEqual({ firstBin: 6, endBin: 342 });
  });
});

describe("bandLevels", () => {
  it("averages each band and scales the byte range to 0..1", () => {
    const frequencies = new Uint8Array([255, 255, 0, 0, 51, 51]);
    expect(bandLevels(frequencies, { firstBin: 0, endBin: 6 }, 3)).toEqual([1, 0, 0.2]);
  });

  it("gives every band at least one bin when bands outnumber bins", () => {
    const levels = bandLevels(new Uint8Array([255, 0]), { firstBin: 0, endBin: 2 }, 4);
    expect(levels).toHaveLength(4);
    expect(levels.every((level) => level >= 0 && level <= 1)).toBe(true);
  });
});
