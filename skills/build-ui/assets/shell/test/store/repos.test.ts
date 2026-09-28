import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Message } from "../../src/core/messages";
import { createId } from "../../src/lib/create-id";
import { getBlob, putBlob } from "../../src/store/blob-repo";
import { openHistoryDatabase, type HistoryDatabase } from "../../src/store/db";
import { addMessage, listMessages } from "../../src/store/message-repo";
import { createThread, deleteThread, listThreads, threadExists, updateThread } from "../../src/store/thread-repo";

let database: HistoryDatabase;

beforeEach(async () => {
  database = await openHistoryDatabase(`test-${createId()}`);
});

function userMessage(threadId: string, createdAt: number, text: string): Message {
  return { kind: "user", id: createId(), threadId, createdAt, request: { workflowId: "w", texts: { text }, files: {}, options: {} } };
}

describe("thread repository", () => {
  it("lists the most recently updated thread first", async () => {
    const first = await createThread(database, "첫 번째", "w", 1);
    const second = await createThread(database, null, "w", 2);
    await updateThread(database, first.id, { updatedAt: 3 });
    expect((await listThreads(database)).map((thread) => thread.id)).toEqual([first.id, second.id]);
  });

  it("tells whether a thread is still there, so a late reply is not written into a deleted one", async () => {
    const thread = await createThread(database, "곧 지울 기록", "w", 1);
    expect(await threadExists(database, thread.id)).toBe(true);
    await deleteThread(database, thread.id);
    expect(await threadExists(database, thread.id)).toBe(false);
  });

  it("deletes a thread together with its messages and blobs only", async () => {
    const doomed = await createThread(database, "지울 기록", "w", 1);
    const kept = await createThread(database, "남길 기록", "w", 1);
    await addMessage(database, userMessage(doomed.id, 1, "안녕"));
    await addMessage(database, userMessage(kept.id, 1, "반가워"));
    const doomedBlob = await putBlob(database, new Blob(["a"], { type: "application/octet-stream" }), doomed.id);
    const keptBlob = await putBlob(database, new Blob(["b"], { type: "application/octet-stream" }), kept.id);

    await deleteThread(database, doomed.id);

    expect((await listThreads(database)).map((thread) => thread.id)).toEqual([kept.id]);
    expect(await listMessages(database, doomed.id)).toEqual([]);
    expect(await listMessages(database, kept.id)).toHaveLength(1);
    expect(await getBlob(database, doomedBlob)).toBeNull();
    expect(await getBlob(database, keptBlob)).not.toBeNull();
  });
});

describe("message and blob repositories", () => {
  it("returns a thread's messages in creation order", async () => {
    const thread = await createThread(database, "순서", "w", 1);
    await addMessage(database, userMessage(thread.id, 20, "둘째"));
    await addMessage(database, userMessage(thread.id, 10, "첫째"));
    const texts = (await listMessages(database, thread.id)).map((message) => (message.kind === "user" ? message.request.texts["text"] : null));
    expect(texts).toEqual(["첫째", "둘째"]);
  });

  it("round-trips blob bytes and mime type", async () => {
    const blobId = await putBlob(database, new Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" }), "t");
    const blob = await getBlob(database, blobId);
    expect(blob?.type).toBe("application/octet-stream");
    expect(new Uint8Array(await (blob ?? new Blob()).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
