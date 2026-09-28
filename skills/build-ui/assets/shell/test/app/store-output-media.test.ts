import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { decodeChunkFrame, type StreamDescriptor } from "../../src/api/client";
import { storeOutputMedia, type MediaClient } from "../../src/app/store-output-media";
import { createId } from "../../src/lib/create-id";
import { getBlob } from "../../src/store/blob-repo";
import { openHistoryDatabase, type HistoryDatabase } from "../../src/store/db";

let database: HistoryDatabase;

beforeEach(async () => {
  database = await openHistoryDatabase(`test-${createId()}`);
});

function streamValue(id: string, extra: Partial<StreamDescriptor> = {}) {
  return { __variable__: { type: "stream", id, kind: "bytes", ...extra } };
}

function fakeClient(chunks: Record<string, number[][]>) {
  const pulled: string[] = [];
  const client: MediaClient = {
    pullStream: async (descriptor) => {
      pulled.push(descriptor.id);
      return (chunks[descriptor.id] ?? []).map((bytes) => new Uint8Array(bytes).buffer);
    },
  };
  return { client, pulled };
}

describe("storeOutputMedia", () => {
  it("replaces a bytes stream with a media reference and keeps the bytes in the blob store", async () => {
    const { client, pulled } = fakeClient({ "stream-1": [[1, 2], [3]] });
    const outputs = {
      cover: streamValue("stream-1", { content_type: "audio/pcm", attrs: { sample_rate: "48000", channels: "2", bit_depth: "16" } }),
    };

    const stored = await storeOutputMedia(database, client, outputs, "thread-1");
    const media = (stored["cover"] as { __media__: Record<string, unknown> })["__media__"];

    expect(pulled).toEqual(["stream-1"]);
    expect(media["content_type"]).toBe("audio/pcm");
    expect(media["size"]).toBe(3);
    expect(media["attrs"]).toEqual({ sample_rate: "48000", channels: "2", bit_depth: "16" });

    const blob = await getBlob(database, String(media["blob_id"]));

    expect(new Uint8Array(await (blob as Blob).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("finds streams nested in objects and arrays", async () => {
    const { client, pulled } = fakeClient({ a: [[9]], b: [[8]] });
    const outputs = { render: { frames: [streamValue("a"), streamValue("b")] } };

    const stored = await storeOutputMedia(database, client, outputs, "thread-1");
    const frames = (stored["render"] as { frames: { __media__: Record<string, unknown> }[] }).frames;

    expect(pulled).toEqual(["a", "b"]);
    expect(frames.every((frame) => typeof frame.__media__["blob_id"] === "string")).toBe(true);
  });

  it("stores the chunk shape the socket actually delivers, not the one a fixture guesses", async () => {
    const identifier = new TextEncoder().encode("stream-1");
    const frame = new ArrayBuffer(2 + identifier.byteLength + 4 + 3);
    const view = new DataView(frame);

    view.setUint16(0, identifier.byteLength);
    new Uint8Array(frame, 2).set(identifier);
    view.setUint32(2 + identifier.byteLength, 0);
    new Uint8Array(frame, 2 + identifier.byteLength + 4).set([7, 8, 9]);

    const decoded = decodeChunkFrame(frame);
    const client: MediaClient = { pullStream: async () => [decoded.chunk] };
    const stored = await storeOutputMedia(database, client, { cover: streamValue("stream-1") }, "thread-1");
    const media = (stored["cover"] as { __media__: Record<string, unknown> })["__media__"];
    const blob = await getBlob(database, String(media["blob_id"]));

    expect(media["size"]).toBe(3);
    expect(new Uint8Array(await (blob as Blob).arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]));
  });

  it("leaves plain values and non-bytes streams untouched", async () => {
    const { client, pulled } = fakeClient({});
    const outputs = { score: { abc: "X:1", truncated: false, log: streamValue("text-1", { kind: "text" }) } };

    expect(await storeOutputMedia(database, client, outputs, "thread-1")).toEqual(outputs);
    expect(pulled).toEqual([]);
  });
});
