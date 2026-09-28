import type { StepLabel } from "./release";

export type StepState = "todo" | "active" | "done" | "failed";

export type StepStates = Readonly<Record<string, StepState>>;

export interface RunStep extends StepLabel {
  state: StepState;
}

export interface JobProgress {
  job_id: string;
  event: string;
}

const EVENT_STATES: Readonly<Record<string, StepState>> = {
  started: "active",
  completed: "done",
  failed: "failed",
  cancelled: "failed",
};

export function showsSteps(steps: readonly StepLabel[] | undefined): steps is readonly StepLabel[] {
  return steps !== undefined && steps.length >= 2;
}

export function advanceSteps(states: StepStates, progress: JobProgress): StepStates {
  const state = EVENT_STATES[progress.event];
  if (!state) return states;
  return { ...states, [progress.job_id]: state };
}

export function listSteps(steps: readonly StepLabel[], states: StepStates): RunStep[] {
  return steps.map((step) => ({ ...step, state: states[step.job] ?? "todo" }));
}
