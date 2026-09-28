import { useLocale } from "../../i18n/locale-context";
import { classNames } from "../../lib/class-names";
import { formatClock } from "../../lib/format-time";
import { DotCanvas } from "../dot-grid/DotCanvas";
import { measureGrid } from "../dot-grid/dot-grid-layout";
import { drawDotGrid, readInkColor } from "../dot-grid/draw-dot-grid";
import type { FramePainter } from "../dot-grid/use-canvas-animation";
import { resamplePeaks, toFractionRegions, waveformLight, type TimeRegion } from "../dot-grid/waveform-light";
import { createSeekHandlers } from "./seek-handlers";
import type { AudioPlayer } from "./use-audio-player";

type WaveformPlayer = Pick<AudioPlayer, "currentTime" | "duration" | "isPlaying" | "readLevels" | "readPosition" | "seekTo">;

interface DotWaveformProps {
  peaks: readonly number[];
  player: WaveformPlayer;
  regions?: readonly TimeRegion[];
  className?: string;
}

function createPainter(peaks: readonly number[], player: WaveformPlayer, regions: readonly TimeRegion[]): FramePainter {
  return (context, size) => {
    const grid = measureGrid(size.width, size.height);
    const frame = {
      heights: resamplePeaks(peaks, grid.columns),
      progress: player.duration > 0 ? player.readPosition() / player.duration : 0,
      levels: player.isPlaying ? player.readLevels() : [],
    };
    const fractions = toFractionRegions(regions, player.duration);
    drawDotGrid(context, size, grid, readInkColor(context), (column, row) => waveformLight(column, row, grid, frame), fractions);
  };
}

export function DotWaveform({ peaks, player, regions = [], className }: DotWaveformProps) {
  const { strings } = useLocale();
  const position = player.currentTime;
  const { handleClick, handleKeyDown } = createSeekHandlers(position, player.duration, player.seekTo);

  return (
    <DotCanvas
      role="slider"
      tabIndex={0}
      aria-label={strings.audio.position}
      aria-valuemin={0}
      aria-valuemax={Math.round(player.duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={formatClock(position)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      paint={createPainter(peaks, player, regions)}
      isAnimated={player.isPlaying}
      className={classNames("cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent", className)}
    />
  );
}
