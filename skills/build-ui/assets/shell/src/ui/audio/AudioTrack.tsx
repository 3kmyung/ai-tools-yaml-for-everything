import { Pause, Play } from "lucide-react";
import { useLocale } from "../../i18n/locale-context";
import { formatPreciseClock } from "../../lib/format-time";
import { IconButton } from "../IconButton";
import type { TimeRegion } from "../dot-grid/waveform-light";
import { DotWaveform } from "./DotWaveform";
import { PlayerControls } from "./PlayerControls";
import type { AudioPlayer } from "./use-audio-player";

interface AudioTrackProps {
  player: AudioPlayer;
  peaks: readonly number[];
  regions?: readonly TimeRegion[];
  downloadName: string;
}

function PlayButton({ player }: { player: Pick<AudioPlayer, "isPlaying" | "isReady" | "togglePlay"> }) {
  const { audio } = useLocale().strings;
  const Icon = player.isPlaying ? Pause : Play;
  return (
    <IconButton size="lg" variant="solid" label={player.isPlaying ? audio.pause : audio.play} disabled={!player.isReady} onClick={player.togglePlay}>
      <Icon aria-hidden className="size-[18px] fill-current" />
    </IconButton>
  );
}

function Clock({ currentTime, duration }: { currentTime: number; duration: number }) {
  return (
    <span className="text-body-lg tabular-nums text-ink">
      {formatPreciseClock(currentTime)}
      <span className="text-ink-tertiary"> / {formatPreciseClock(duration)}</span>
    </span>
  );
}

export function AudioTrack({ player, peaks, regions, downloadName }: AudioTrackProps) {
  return (
    <div>
      <audio ref={player.audioRef} src={player.source ?? undefined} preload="metadata" />
      <DotWaveform peaks={peaks} player={player} regions={regions} className="h-18" />
      <div className="mt-3 flex items-center gap-3">
        <PlayButton player={player} />
        <Clock currentTime={player.currentTime} duration={player.duration} />
        <div className="ml-auto">
          <PlayerControls player={player} downloadUrl={player.source} downloadName={downloadName} />
        </div>
      </div>
    </div>
  );
}
