import { buildRunRequest, fileSlotsFor, type Draft } from "../core/draft";
import type { StoredFile, UserMessage } from "../core/messages";
import type { Release } from "../core/release";
import { deriveThreadTitle } from "../core/request-summary";
import { createId } from "../lib/create-id";
import { putBlob } from "../store/blob-repo";
import type { HistoryDatabase } from "../store/db";
import { addMessage } from "../store/message-repo";
import { createThread, updateThread } from "../store/thread-repo";

async function resolveThreadId(database: HistoryDatabase, release: Release, draft: Draft, activeThreadId: string | null, now: number) {
  if (activeThreadId) return activeThreadId;
  const thread = await createThread(database, deriveThreadTitle(release, draft), draft.workflowId, now);
  return thread.id;
}

async function storeDraftFiles(database: HistoryDatabase, release: Release, draft: Draft, threadId: string) {
  const stored: Record<string, StoredFile> = {};
  for (const slot of fileSlotsFor(release, draft.workflowId)) {
    const file = draft.files[slot.field];
    if (!file) continue;
    const blobId = await putBlob(database, file, threadId);
    stored[slot.field] = { blobId, name: file.name, type: file.type, size: file.size };
  }
  return stored;
}

export async function recordRequest(database: HistoryDatabase, release: Release, draft: Draft, activeThreadId: string | null): Promise<UserMessage> {
  const now = Date.now();
  const threadId = await resolveThreadId(database, release, draft, activeThreadId, now);
  const request = buildRunRequest(release, draft, await storeDraftFiles(database, release, draft, threadId));
  const prompt: UserMessage = { kind: "user", id: createId(), threadId, createdAt: now, request };
  await addMessage(database, prompt);
  await updateThread(database, threadId, { updatedAt: now });
  return prompt;
}
