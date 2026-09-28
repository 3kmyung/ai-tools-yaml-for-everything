export interface TimeRange {
  start: number;
  end: number;
}

export function findRangeAt(ranges: readonly TimeRange[], seconds: number): number {
  if (!Number.isFinite(seconds)) return -1;

  return ranges.findIndex((range) => seconds >= range.start && seconds < range.end);
}
