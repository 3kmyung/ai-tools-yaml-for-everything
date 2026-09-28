import type { ControllerClient, StreamDescriptor } from "../api/client";
import type { JobOutputs, ResultMediaReference } from "../core/messages";
import { putBlob } from "../store/blob-repo";
import type { HistoryDatabase } from "../store/db";

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

export type MediaClient = Pick<ControllerClient, "pullStream">;

function readStreamDescriptor(value: unknown): StreamDescriptor | null {
  if (typeof value !== "object" || value === null) return null;

  const variable = (value as Record<string, unknown>)["__variable__"];

  if (typeof variable !== "object" || variable === null) return null;

  const candidate = variable as Record<string, unknown>;

  if (candidate["type"] !== "stream" || typeof candidate["id"] !== "string") return null;

  return candidate as unknown as StreamDescriptor;
}

function toBytes(chunk: unknown): Uint8Array | null {
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);

  return null;
}

function joinChunks(chunks: readonly unknown[]): Uint8Array<ArrayBuffer> {
  const parts = chunks.map(toBytes).filter((part): part is Uint8Array => part !== null);
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }

  return joined;
}

async function storeStream(
  database: HistoryDatabase,
  client: MediaClient,
  descriptor: StreamDescriptor,
  threadId: string,
): Promise<ResultMediaReference> {
  const contentType = descriptor.content_type || DEFAULT_CONTENT_TYPE;
  const bytes = joinChunks(await client.pullStream(descriptor));
  const blobId = await putBlob(database, new Blob([bytes], { type: contentType }), threadId);

  return {
    __media__: {
      blob_id: blobId,
      content_type: contentType,
      ...(descriptor.filename ? { filename: descriptor.filename } : {}),
      size: bytes.byteLength,
      attrs: descriptor.attrs ?? {},
    },
  };
}

async function storeValue(
  database: HistoryDatabase,
  client: MediaClient,
  value: unknown,
  threadId: string,
): Promise<unknown> {
  const descriptor = readStreamDescriptor(value);

  if (descriptor) {
    if (descriptor.kind !== "bytes") return value;

    return storeStream(database, client, descriptor, threadId);
  }

  if (Array.isArray(value)) {
    const items: unknown[] = [];

    for (const item of value) {
      items.push(await storeValue(database, client, item, threadId));
    }

    return items;
  }

  if (typeof value === "object" && value !== null) {
    const entries: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      entries[key] = await storeValue(database, client, item, threadId);
    }

    return entries;
  }

  return value;
}

export async function storeOutputMedia(
  database: HistoryDatabase,
  client: MediaClient,
  outputs: JobOutputs,
  threadId: string,
): Promise<JobOutputs> {
  return (await storeValue(database, client, outputs, threadId)) as JobOutputs;
}
