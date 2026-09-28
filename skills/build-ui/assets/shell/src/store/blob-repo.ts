import { createId } from "../lib/create-id";
import type { HistoryDatabase } from "./db";

export async function putBlob(database: HistoryDatabase, blob: Blob, threadId: string): Promise<string> {
  const id = createId();
  const bytes = await blob.arrayBuffer();
  await database.put("blobs", { id, threadId, mimeType: blob.type, bytes });
  return id;
}

export async function getBlob(database: HistoryDatabase, blobId: string): Promise<Blob | null> {
  const stored = await database.get("blobs", blobId);
  if (!stored) return null;
  return new Blob([stored.bytes], { type: stored.mimeType });
}
