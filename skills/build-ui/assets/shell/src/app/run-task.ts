import type { ControllerClient, JobEvent } from "../api/client";
import type { JobOutputs } from "../core/messages";

export type TaskClient = Pick<ControllerClient, "runWorkflow" | "watchTask" | "cancelTask">;

export type TaskOutcome =
  | { status: "completed"; outputs: JobOutputs }
  | { status: "cancelled" }
  | { status: "failed"; detail: string };

export interface RunControl {
  attach: (taskId: string) => void;
  stop: () => void;
  isStopped: () => boolean;
}

export function createRunControl(cancelTask: (taskId: string) => Promise<void>): RunControl {
  let attachedTaskId: string | null = null;
  let isStopRequested = false;
  const cancel = () => {
    if (attachedTaskId) cancelTask(attachedTaskId).catch(() => undefined);
  };
  return {
    attach: (taskId) => {
      attachedTaskId = taskId;
      if (isStopRequested) cancel();
    },
    stop: () => {
      isStopRequested = true;
      cancel();
    },
    isStopped: () => isStopRequested,
  };
}

export async function runTask(
  client: TaskClient,
  workflowId: string,
  input: Record<string, unknown>,
  control: RunControl,
  onJobEvent: (event: JobEvent) => void,
): Promise<TaskOutcome> {
  if (control.isStopped()) return { status: "cancelled" };
  const outputs: Record<string, unknown> = {};
  const started = await client.runWorkflow(workflowId, input);
  control.attach(started.task_id);
  const finished = await client.watchTask(started.task_id, undefined, (event) => {
    if (event.event === "completed") outputs[event.job_id] = event.output;
    onJobEvent(event);
  });
  const status = String(finished.status).toLowerCase();
  if (status === "completed") return { status: "completed", outputs };
  if (status === "cancelled") return { status: "cancelled" };
  return { status: "failed", detail: finished.error || status };
}
