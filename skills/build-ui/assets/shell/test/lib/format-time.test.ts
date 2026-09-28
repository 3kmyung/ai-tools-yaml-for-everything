import { describe, expect, it } from "vitest";
import { formatClock, formatFileSize, formatPreciseClock, formatRunTime, formatSeconds } from "../../src/lib/format-time";

describe("formatSeconds", () => {
  it("always shows exactly two decimals", () => {
    expect(formatSeconds(2, "ko")).toBe("2.00초");
    expect(formatSeconds(2.000794, "ko")).toBe("2.00초");
    expect(formatSeconds(3.500952, "en")).toBe("3.50s");
    expect(formatSeconds(0.807, "en")).toBe("0.81s");
    expect(formatSeconds(125.4, "zh")).toBe("125.40 秒");
  });

  it("treats invalid values as zero", () => {
    expect(formatSeconds(Number.NaN, "en")).toBe("0.00s");
    expect(formatSeconds(-1, "ko")).toBe("0.00초");
  });
});

describe("formatPreciseClock", () => {
  it("keeps hundredths on a minute clock", () => {
    expect(formatPreciseClock(2.000794)).toBe("0:02.00");
    expect(formatPreciseClock(7.300975)).toBe("0:07.30");
    expect(formatPreciseClock(125.456)).toBe("2:05.46");
  });

  it("carries rounding into the next minute", () => {
    expect(formatPreciseClock(59.996)).toBe("1:00.00");
    expect(formatPreciseClock(Number.POSITIVE_INFINITY)).toBe("0:00.00");
  });
});

describe("formatClock", () => {
  it("pads seconds to two digits", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(7.9)).toBe("0:07");
    expect(formatClock(125)).toBe("2:05");
  });

  it("treats invalid durations as zero", () => {
    expect(formatClock(Number.NaN)).toBe("0:00");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("formatRunTime", () => {
  it("shows tenths of a second while short, a clock after that", () => {
    expect(formatRunTime(1234, "ko")).toBe("1.2초 만에 완료");
    expect(formatRunTime(125000, "ko")).toBe("2:05 만에 완료");
    expect(formatRunTime(1234, "en")).toBe("Done in 1.2s");
    expect(formatRunTime(125000, "zh")).toBe("用时 2:05");
  });
});

describe("formatFileSize", () => {
  it("picks the unit that reads best", () => {
    expect([formatFileSize(512), formatFileSize(2048), formatFileSize(776238)]).toEqual(["512B", "2KB", "758KB"]);
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0MB");
  });
});
