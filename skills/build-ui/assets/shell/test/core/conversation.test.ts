import { describe, expect, it } from "vitest";
import { buildTurns } from "../../src/core/conversation";
import type { ErrorMessage, ResultMessage, UserMessage } from "../../src/core/messages";

function prompt(id: string, createdAt: number): UserMessage {
  return { kind: "user", id, threadId: "t", createdAt, request: { workflowId: "w", texts: { text: id }, files: {}, options: {} } };
}

function result(replyTo: string, createdAt: number): ResultMessage {
  return { kind: "result", id: `r-${createdAt}`, threadId: "t", createdAt, replyTo, result: {}, outputs: {}, elapsedMilliseconds: 1 };
}

function failure(replyTo: string, createdAt: number): ErrorMessage {
  return { kind: "error", id: `e-${createdAt}`, threadId: "t", createdAt, replyTo, reason: "server", detail: "" };
}

describe("buildTurns", () => {
  it("pairs each prompt with its newest reply", () => {
    const turns = buildTurns([prompt("p1", 1), failure("p1", 2), result("p1", 3)], null);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.reply?.kind).toBe("result");
    expect(turns[0]?.status).toBe("answered");
  });

  it("marks the running prompt as pending even when an older reply exists", () => {
    const turns = buildTurns([prompt("p1", 1), failure("p1", 2)], "p1");
    expect(turns[0]?.status).toBe("pending");
  });

  it("marks a prompt with no reply and no run in flight as unanswered", () => {
    const turns = buildTurns([prompt("p1", 1), result("p1", 2), prompt("p2", 3)], null);
    expect(turns.map((turn) => turn.status)).toEqual(["answered", "unanswered"]);
  });
});
