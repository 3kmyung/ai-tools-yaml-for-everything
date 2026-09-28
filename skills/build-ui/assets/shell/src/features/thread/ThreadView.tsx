import { useEffect, useMemo, useRef, useState } from "react";
import type { PendingRun, Turn } from "../../core/conversation";
import type { UserMessage } from "../../core/messages";
import type { PlaybackFocus, Release } from "../../core/release";
import { TurnView } from "./TurnView";

interface ThreadViewProps {
  release: Release;
  turns: readonly Turn[];
  pending: PendingRun | null;
  canRetry: boolean;
  onRetry: (prompt: UserMessage) => void;
}

export function ThreadView({ release, turns, pending, canRetry, onRetry }: ThreadViewProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastReplyId = turns.at(-1)?.reply?.id;
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playback = useMemo<PlaybackFocus>(() => ({ playingId, onPlaybackStart: setPlayingId }), [playingId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, lastReplyId, pending?.promptId]);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-10 px-4 pt-6 pb-6">
      {turns.map((turn) => (
        <TurnView key={turn.prompt.id} release={release} turn={turn} pending={pending} canRetry={canRetry} playback={playback} onRetry={onRetry} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
