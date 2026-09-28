import { describe, expect, it } from "vitest";
import { createExclusiveRunner, runFulfillment, type FulfillmentSteps } from "../../src/app/run-lifecycle";

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("createExclusiveRunner", () => {
  it("turns a second run away while the first is running and says so", async () => {
    const busyChanges: boolean[] = [];
    const tryRun = createExclusiveRunner((isBusy) => busyChanges.push(isBusy));
    const first = deferred();

    expect(tryRun(() => first.promise)).toBe(true);
    expect(tryRun(async () => {})).toBe(false);

    first.resolve();
    await first.promise;
    await Promise.resolve();
    expect(tryRun(async () => {})).toBe(true);
    expect(busyChanges.slice(0, 3)).toEqual([true, false, true]);
  });
});

function trackedSteps(overrides: Partial<FulfillmentSteps> = {}) {
  const calls: string[] = [];
  const steps: FulfillmentSteps = {
    showPending: () => calls.push("show"),
    fulfill: async () => {
      calls.push("fulfill");
    },
    reload: async () => {
      calls.push("reload");
    },
    clearPending: () => calls.push("clear"),
    ...overrides,
  };
  return { calls, steps };
}

describe("runFulfillment", () => {
  it("reads the reply back before the pending card goes", async () => {
    const { calls, steps } = trackedSteps();
    await runFulfillment(steps);
    expect(calls).toEqual(["show", "fulfill", "reload", "clear"]);
  });

  it("still reloads and clears when the run fails", async () => {
    const { calls, steps } = trackedSteps({
      fulfill: async () => {
        throw new Error("boom");
      },
    });
    await expect(runFulfillment(steps)).rejects.toThrow("boom");
    expect(calls).toEqual(["show", "reload", "clear"]);
  });

  it("clears the pending card even when reading back fails", async () => {
    const { calls, steps } = trackedSteps({
      reload: async () => {
        throw new Error("db");
      },
    });
    await expect(runFulfillment(steps)).rejects.toThrow("db");
    expect(calls).toEqual(["show", "fulfill", "clear"]);
  });
});
