import { describe, expect, it } from "vitest";
import type { JobEvent, TaskState } from "../../src/api/client";
import { createRunControl, runTask, type TaskClient } from "../../src/app/run-task";

interface FakeRun {
  events: JobEvent[];
  finalState: TaskState;
}

function event(jobId: string, phase: JobEvent["event"], output?: unknown): JobEvent {
  return { task_id: "task-1", workflow_id: "w", job_id: jobId, event: phase, ...(output !== undefined && { output }) };
}

function fakeClient(run: FakeRun) {
  const calls: string[] = [];
  const client: TaskClient = {
    runWorkflow: async (workflowId, input) => {
      calls.push(`run ${workflowId} ${JSON.stringify(input)}`);
      return { task_id: "task-1", status: "pending" };
    },
    watchTask: async (taskId, _onState, onJobEvent) => {
      calls.push(`watch ${taskId}`);
      run.events.forEach((jobEvent) => onJobEvent?.(jobEvent));
      return run.finalState;
    },
    cancelTask: async (taskId) => {
      calls.push(`cancel ${taskId}`);
    },
  };
  return { client, calls };
}

describe("runTask", () => {
  it("collects every completed job's output under its job id", async () => {
    const run = { events: [event("read", "started"), event("read", "completed", { text: "a" }), event("__job__", "completed", { items: [] })], finalState: { task_id: "task-1", status: "completed" } };
    const { client, calls } = fakeClient(run);
    const seen: string[] = [];
    const outcome = await runTask(client, "w", { source: 1 }, createRunControl(client.cancelTask), (jobEvent) => seen.push(`${jobEvent.job_id} ${jobEvent.event}`));
    expect(outcome).toEqual({ status: "completed", outputs: { read: { text: "a" }, __job__: { items: [] } } });
    expect(seen).toEqual(["read started", "read completed", "__job__ completed"]);
    expect(calls).toEqual(['run w {"source":1}', "watch task-1"]);
  });

  it("reports the server's error for a failed task", async () => {
    const { client } = fakeClient({ events: [], finalState: { task_id: "task-1", status: "failed", error: "boom" } });
    expect(await runTask(client, "w", {}, createRunControl(client.cancelTask), () => {})).toEqual({ status: "failed", detail: "boom" });
  });

  it("reports a cancelled task as cancelled", async () => {
    const { client } = fakeClient({ events: [], finalState: { task_id: "task-1", status: "cancelled" } });
    expect(await runTask(client, "w", {}, createRunControl(client.cancelTask), () => {})).toEqual({ status: "cancelled" });
  });
});

describe("createRunControl", () => {
  it("cancels as soon as the task id is known when stop came first", async () => {
    const cancelled: string[] = [];
    const control = createRunControl(async (taskId) => {
      cancelled.push(taskId);
    });
    control.stop();
    expect(cancelled).toEqual([]);
    control.attach("task-9");
    expect(cancelled).toEqual(["task-9"]);
    expect(control.isStopped()).toBe(true);
  });

  it("cancels the attached task on stop and swallows a refused cancel", async () => {
    const control = createRunControl(async () => {
      throw new Error("refused");
    });
    control.attach("task-2");
    expect(() => control.stop()).not.toThrow();
  });

  it("does not start a run that was stopped before it began", async () => {
    const { client, calls } = fakeClient({ events: [], finalState: { task_id: "task-1", status: "completed" } });
    const control = createRunControl(client.cancelTask);
    control.stop();
    expect(await runTask(client, "w", {}, control, () => {})).toEqual({ status: "cancelled" });
    expect(calls).toEqual([]);
  });
});
