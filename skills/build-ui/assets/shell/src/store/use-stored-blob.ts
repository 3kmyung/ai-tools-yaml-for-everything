import { useEffect, useState } from "react";
import type { StoredFile } from "../core/messages";
import { getBlob } from "./blob-repo";
import { getSharedDatabase } from "./db";

export function useStoredBlob(blobId: string | null): Blob | null {
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setBlob(null);
    if (!blobId) return;
    void getSharedDatabase()
      .then((database) => getBlob(database, blobId))
      .then((stored) => {
        if (isCurrent) setBlob(stored);
      });
    return () => {
      isCurrent = false;
    };
  }, [blobId]);

  return blob;
}

export function useStoredFile(file: StoredFile | undefined): Blob | null {
  return useStoredBlob(file?.blobId ?? null);
}
