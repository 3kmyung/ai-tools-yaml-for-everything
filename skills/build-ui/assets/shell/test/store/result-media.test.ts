import { describe, expect, it } from "vitest";
import type { ResultMedia } from "../../src/core/messages";
import { toPlayableMediaBlob } from "../../src/store/use-result-media";

function media(overrides: Partial<ResultMedia> = {}): ResultMedia {
  return {
    blob_id: "blob-1",
    content_type: "audio/pcm",
    size: 4,
    attrs: { sample_rate: "48000", channels: "2", bit_depth: "16" },
    ...overrides,
  };
}

async function headerOf(blob: Blob) {
  return new DataView(await blob.arrayBuffer());
}

describe("toPlayableMediaBlob", () => {
  it("wraps raw pcm in a wav header that carries the captured sample rate and channel count", async () => {
    const frames = new Blob([new Uint8Array([1, 2, 3, 4])]);
    const playable = await toPlayableMediaBlob(media(), frames);
    const view = await headerOf(playable);

    expect(playable.type).toBe("audio/wav");
    expect(playable.size).toBe(48);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(48000 * 4);
    expect(view.getUint32(40, true)).toBe(4);
  });

  it("returns already playable audio untouched", async () => {
    const wav = new Blob([new Uint8Array([1, 2])], { type: "audio/wav" });

    expect(await toPlayableMediaBlob(media({ content_type: "audio/wav" }), wav)).toBe(wav);
  });

  it("returns the stored bytes untouched when the bit depth is not the one the encoder writes", async () => {
    const frames = new Blob([new Uint8Array([1, 2])]);

    expect(await toPlayableMediaBlob(media({ attrs: { sample_rate: "48000", channels: "2", bit_depth: "24" } }), frames)).toBe(frames);
  });

  it("returns the stored bytes untouched when the sample rate is missing", async () => {
    const frames = new Blob([new Uint8Array([1, 2])]);

    expect(await toPlayableMediaBlob(media({ attrs: { channels: "2", bit_depth: "16" } }), frames)).toBe(frames);
  });
});
