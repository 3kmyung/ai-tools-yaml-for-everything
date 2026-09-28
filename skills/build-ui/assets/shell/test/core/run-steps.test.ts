import { describe, expect, it } from "vitest";
import { advanceSteps, listSteps, showsSteps } from "../../src/core/run-steps";

const STEPS = [
  { job: "read", label: { en: "Read", ko: "읽기", zh: "读取" } },
  { job: "write", label: { en: "Write", ko: "쓰기", zh: "写入" } },
];

describe("advanceSteps", () => {
  it("follows each job's events independently", () => {
    const started = advanceSteps({}, { job_id: "read", event: "started" });
    const done = advanceSteps(started, { job_id: "read", event: "completed" });
    const failed = advanceSteps(done, { job_id: "write", event: "failed" });
    expect(listSteps(STEPS, failed).map((step) => step.state)).toEqual(["done", "failed"]);
    expect(listSteps(STEPS, started).map((step) => step.state)).toEqual(["active", "todo"]);
  });

  it("ignores events that do not move a step", () => {
    const states = { read: "active" as const };
    expect(advanceSteps(states, { job_id: "read", event: "routed" })).toBe(states);
  });
});

describe("showsSteps", () => {
  it("lists steps only for a workflow with two jobs or more", () => {
    expect([showsSteps(undefined), showsSteps([STEPS[0]!]), showsSteps(STEPS)]).toEqual([false, false, true]);
  });
});
