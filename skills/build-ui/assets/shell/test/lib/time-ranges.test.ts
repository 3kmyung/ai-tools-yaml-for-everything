import { describe, expect, it } from "vitest";
import { findRangeAt } from "../../src/lib/time-ranges";

const ranges = [
  { start: 0, end: 2.000794 },
  { start: 2.000794, end: 3.500952 },
  { start: 3.500952, end: 6.500839 },
];

describe("findRangeAt", () => {
  it("returns the range that contains the time, start inclusive and end exclusive", () => {
    expect(findRangeAt(ranges, 0)).toBe(0);
    expect(findRangeAt(ranges, 2.000794)).toBe(1);
    expect(findRangeAt(ranges, 3.4)).toBe(1);
    expect(findRangeAt(ranges, 6.5)).toBe(2);
  });

  it("returns -1 outside every range", () => {
    expect(findRangeAt(ranges, 6.500839)).toBe(-1);
    expect(findRangeAt(ranges, 8.8)).toBe(-1);
    expect(findRangeAt(ranges, Number.NaN)).toBe(-1);
    expect(findRangeAt([], 1)).toBe(-1);
  });
});
