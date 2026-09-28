export interface AudioElementSnapshot {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export type AudioElementLike = Pick<HTMLMediaElement, "paused" | "currentTime" | "duration" | "addEventListener" | "removeEventListener">;

const SYNC_EVENTS = ["pause", "timeupdate", "seeked", "durationchange", "loadedmetadata", "ended", "emptied"] as const;

export const EMPTY_SNAPSHOT: AudioElementSnapshot = { isPlaying: false, currentTime: 0, duration: 0 };

export function readSnapshot(element: AudioElementLike): AudioElementSnapshot {
  return {
    isPlaying: !element.paused,
    currentTime: element.currentTime,
    duration: Number.isFinite(element.duration) ? element.duration : 0,
  };
}

export function subscribeToAudioElement(
  element: AudioElementLike,
  onChange: (snapshot: AudioElementSnapshot) => void,
  onStart: () => void,
): () => void {
  const sync = () => onChange(readSnapshot(element));
  const started = () => {
    onStart();
    sync();
  };
  element.addEventListener("play", started);
  SYNC_EVENTS.forEach((name) => element.addEventListener(name, sync));
  sync();
  return () => {
    element.removeEventListener("play", started);
    SYNC_EVENTS.forEach((name) => element.removeEventListener(name, sync));
  };
}
