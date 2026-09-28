import { useEffect, useState } from "react";
import { wrapPcm16Wav } from "../audio/wav-encoder";
import type { ResultMedia } from "../core/messages";
import { getBlob } from "./blob-repo";
import { getSharedDatabase } from "./db";

const PCM_CONTENT_TYPE = "audio/pcm";
const WAV_CONTENT_TYPE = "audio/wav";
const SUPPORTED_BIT_DEPTH = "16";

export async function toPlayableMediaBlob(media: ResultMedia, stored: Blob): Promise<Blob> {
  if (media.content_type !== PCM_CONTENT_TYPE) return stored;
  if (media.attrs["bit_depth"] !== SUPPORTED_BIT_DEPTH) return stored;

  const sampleRate = Number(media.attrs["sample_rate"]);
  const channels = Number(media.attrs["channels"]);

  if (!Number.isFinite(sampleRate) || !Number.isFinite(channels)) return stored;
  if (sampleRate <= 0 || channels <= 0) return stored;

  return new Blob([wrapPcm16Wav(await stored.arrayBuffer(), sampleRate, channels)], { type: WAV_CONTENT_TYPE });
}

export function useResultMedia(media: ResultMedia | undefined): Blob | null {
  const [blob, setBlob] = useState<Blob | null>(null);
  const blobId = media?.blob_id ?? null;

  useEffect(() => {
    let isCurrent = true;
    setBlob(null);
    if (!media || !blobId) return;

    void getSharedDatabase()
      .then((database) => getBlob(database, blobId))
      .then((stored) => (stored ? toPlayableMediaBlob(media, stored) : null))
      .then((playable) => {
        if (isCurrent) setBlob(playable);
      });

    return () => {
      isCurrent = false;
    };
  }, [media, blobId]);

  return blob;
}
