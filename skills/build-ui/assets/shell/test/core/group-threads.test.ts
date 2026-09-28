import { describe, expect, it } from "vitest";
import { groupThreadsByRecency } from "../../src/core/group-threads";
import type { Thread } from "../../src/core/messages";

const NOW = new Date(2026, 8, 12, 15, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

function thread(id: string, hoursAgo: number): Thread {
  const updatedAt = NOW - hoursAgo * HOUR;
  return { id, title: id, workflowId: "w", createdAt: updatedAt, updatedAt };
}

describe("groupThreadsByRecency", () => {
  it("buckets threads into today, the last week, and older, newest first", () => {
    const groups = groupThreadsByRecency([thread("old", 24 * 30), thread("today", 1), thread("week", 40)], NOW);
    expect(groups.map((group) => group.recency)).toEqual(["today", "lastWeek", "older"]);
    expect(groups.map((group) => group.threads[0]?.id)).toEqual(["today", "week", "old"]);
  });

  it("treats earlier today, past midnight, as today", () => {
    const groups = groupThreadsByRecency([thread("morning", 14)], NOW);
    expect(groups[0]?.recency).toBe("today");
  });

  it("returns no groups for no threads", () => {
    expect(groupThreadsByRecency([], NOW)).toEqual([]);
  });
});
