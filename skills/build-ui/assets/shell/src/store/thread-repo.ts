import type { Thread } from "../core/messages";
import { createId } from "../lib/create-id";
import type { HistoryDatabase } from "./db";
import { threadMessageRange } from "./message-repo";

export async function listThreads(database: HistoryDatabase): Promise<Thread[]> {
  const oldestFirst = await database.getAllFromIndex("threads", "byUpdatedAt");
  return oldestFirst.reverse();
}

export async function threadExists(database: HistoryDatabase, threadId: string): Promise<boolean> {
  return (await database.getKey("threads", threadId)) !== undefined;
}

export async function createThread(database: HistoryDatabase, title: string | null, workflowId: string, now: number): Promise<Thread> {
  const thread: Thread = { id: createId(), title, workflowId, createdAt: now, updatedAt: now };
  await database.put("threads", thread);
  return thread;
}

export async function updateThread(
  database: HistoryDatabase,
  threadId: string,
  patch: Partial<Pick<Thread, "title" | "updatedAt">>,
): Promise<void> {
  const thread = await database.get("threads", threadId);
  if (!thread) return;
  await database.put("threads", { ...thread, ...patch });
}

export async function deleteThread(database: HistoryDatabase, threadId: string): Promise<void> {
  const transaction = database.transaction(["threads", "messages", "blobs"], "readwrite");
  const [messageKeys, blobKeys] = await Promise.all([
    transaction.objectStore("messages").index("byThread").getAllKeys(threadMessageRange(threadId)),
    transaction.objectStore("blobs").index("byThread").getAllKeys(threadId),
  ]);
  await Promise.all([
    transaction.objectStore("threads").delete(threadId),
    ...messageKeys.map((key) => transaction.objectStore("messages").delete(key)),
    ...blobKeys.map((key) => transaction.objectStore("blobs").delete(key)),
    transaction.done,
  ]);
}
