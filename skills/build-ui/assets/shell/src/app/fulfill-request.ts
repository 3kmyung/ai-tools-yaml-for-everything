import type { ControllerClient, JobEvent } from "../api/client";
import { failureFromServerDetail, RunFailure, toRunFailure } from "../core/failure-copy";
import type { JobOutputs, Reply, UserMessage } from "../core/messages";
import type { Release } from "../core/release";
import { buildWorkflowInput } from "../core/workflow-input";
import { createId } from "../lib/create-id";
import { getBlob } from "../store/blob-repo";
import type { HistoryDatabase } from "../store/db";
import { addMessage } from "../store/message-repo";
import { threadExists, updateThread } from "../store/thread-repo";
import { runTask, type RunControl, type TaskClient } from "./run-task";
import { storeOutputMedia, type MediaClient } from "./store-output-media";

export interface FulfillJob {
  database: HistoryDatabase;
  release: Release;
  client: TaskClient & MediaClient & Pick<ControllerClient, "streamFile">;
  prompt: UserMessage;
  control: RunControl;
  onJobEvent: (event: JobEvent) => void;
}

function replyBase(prompt: UserMessage) {
  return { id: createId(), threadId: prompt.threadId, createdAt: Date.now(), replyTo: prompt.id };
}

function errorReply(prompt: UserMessage, failure: RunFailure): Reply {
  return { ...replyBase(prompt), kind: "error", reason: failure.reason, detail: failure.detail };
}

async function loadUploads({ database, client, prompt }: FulfillJob): Promise<Record<string, unknown>> {
  const uploads: Record<string, unknown> = {};
  for (const [field, stored] of Object.entries(prompt.request.files)) {
    const blob = await getBlob(database, stored.blobId);
    if (!blob) throw new RunFailure("missing-file", stored.name);
    uploads[field] = client.streamFile(new File([blob], stored.name, { type: stored.type }));
  }
  return uploads;
}

function readResult(release: Release, outputs: JobOutputs, prompt: UserMessage): unknown {
  try {
    return release.readResult(outputs, prompt.request);
  } catch (error) {
    throw new RunFailure("unreadable-output", error instanceof Error ? error.message : String(error));
  }
}

async function createReply(job: FulfillJob): Promise<Reply> {
  const { release, prompt } = job;
  const startedAt = performance.now();
  try {
    const input = buildWorkflowInput(release, prompt.request, await loadUploads(job));
    const outcome = await runTask(job.client, prompt.request.workflowId, input, job.control, job.onJobEvent);
    if (outcome.status === "cancelled") return errorReply(prompt, new RunFailure("cancelled", ""));
    if (outcome.status === "failed") return errorReply(prompt, failureFromServerDetail(outcome.detail, release.failures));
    const outputs = await storeOutputMedia(job.database, job.client, outcome.outputs, prompt.threadId);
    const result = readResult(release, outputs, prompt);
    const elapsedMilliseconds = performance.now() - startedAt;
    return { ...replyBase(prompt), kind: "result", result, outputs, elapsedMilliseconds };
  } catch (error) {
    return errorReply(prompt, toRunFailure(error, release.failures));
  }
}

export async function fulfillRequest(job: FulfillJob): Promise<void> {
  const reply = await createReply(job);
  if (!(await threadExists(job.database, job.prompt.threadId))) return;
  await addMessage(job.database, reply);
  await updateThread(job.database, job.prompt.threadId, { updatedAt: reply.createdAt });
}
