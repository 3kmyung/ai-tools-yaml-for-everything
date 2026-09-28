import { useCallback, useMemo, useRef, useState } from "react";
import type { JobEvent } from "../api/client";
import { getControllerClient } from "../api/controller";
import type { PendingRun } from "../core/conversation";
import type { Draft } from "../core/draft";
import type { UserMessage } from "../core/messages";
import type { Release } from "../core/release";
import { advanceSteps } from "../core/run-steps";
import { getSharedDatabase } from "../store/db";
import type { ThreadsControls } from "../store/use-threads";
import { fulfillRequest } from "./fulfill-request";
import { recordRequest } from "./record-request";
import { createExclusiveRunner, runFulfillment } from "./run-lifecycle";
import { createRunControl, type RunControl } from "./run-task";

export interface RunsControls {
  pending: PendingRun | null;
  isBusy: boolean;
  run: (draft: Draft) => boolean;
  retry: (prompt: UserMessage) => boolean;
  stop: () => void;
}

function useExclusiveRunner() {
  const [isBusy, setBusy] = useState(false);
  const tryRun = useMemo(() => createExclusiveRunner(setBusy), []);
  return { isBusy, tryRun };
}

function usePromptFulfillment(release: Release, reload: () => Promise<void>) {
  const [pending, setPending] = useState<PendingRun | null>(null);
  const controlRef = useRef<RunControl | null>(null);

  const showJobEvent = useCallback((event: JobEvent) => {
    setPending((current) => (current ? { ...current, steps: advanceSteps(current.steps, event) } : current));
  }, []);

  const fulfill = useCallback(async (prompt: UserMessage) => {
    const client = getControllerClient(release.controller);
    const control = createRunControl(client.cancelTask);
    controlRef.current = control;
    await runFulfillment({
      showPending: () => setPending({ promptId: prompt.id, workflowId: prompt.request.workflowId, startedAt: Date.now(), steps: {}, isStopping: false }),
      fulfill: async () => fulfillRequest({ database: await getSharedDatabase(), release, client, prompt, control, onJobEvent: showJobEvent }),
      reload,
      clearPending: () => {
        controlRef.current = null;
        setPending(null);
      },
    });
  }, [release, reload, showJobEvent]);

  const stop = useCallback(() => {
    const control = controlRef.current;
    if (!control) return;
    control.stop();
    setPending((current) => (current ? { ...current, isStopping: true } : current));
  }, []);

  return { pending, fulfill, stop };
}

export function useRuns(release: Release, { activeThreadId, selectThread, reload }: ThreadsControls): RunsControls {
  const { isBusy, tryRun } = useExclusiveRunner();
  const { pending, fulfill, stop } = usePromptFulfillment(release, reload);

  const run = useCallback((draft: Draft) => tryRun(async () => {
    const prompt = await recordRequest(await getSharedDatabase(), release, draft, activeThreadId);
    selectThread(prompt.threadId);
    await fulfill(prompt);
  }), [activeThreadId, fulfill, release, selectThread, tryRun]);

  const retry = useCallback((prompt: UserMessage) => tryRun(() => fulfill(prompt)), [fulfill, tryRun]);

  return { pending, isBusy, run, retry, stop };
}
