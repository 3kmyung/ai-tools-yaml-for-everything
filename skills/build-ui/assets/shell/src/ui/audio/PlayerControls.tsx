import { Download, RotateCcw, RotateCw } from "lucide-react";
import { fillTemplate } from "../../i18n/dictionaries";
import { useLocale } from "../../i18n/locale-context";
import { IconButton } from "../IconButton";
import { IconLink } from "../IconLink";
import type { AudioPlayer } from "./use-audio-player";

const SKIP_SECONDS = 10;
const SKIP_WORTHY_DURATION = 30;

interface PlayerControlsProps {
  player: Pick<AudioPlayer, "duration" | "skipBy" | "rate" | "cycleRate">;
  downloadUrl: string | null;
  downloadName: string;
}

function SkipButtons({ skipBy }: Pick<AudioPlayer, "skipBy">) {
  const { audio } = useLocale().strings;
  return (
    <>
      <IconButton label={fillTemplate(audio.skipBack, { seconds: SKIP_SECONDS })} onClick={() => skipBy(-SKIP_SECONDS)}>
        <RotateCcw aria-hidden className="size-4" />
      </IconButton>
      <IconButton label={fillTemplate(audio.skipForward, { seconds: SKIP_SECONDS })} onClick={() => skipBy(SKIP_SECONDS)}>
        <RotateCw aria-hidden className="size-4" />
      </IconButton>
    </>
  );
}

function RateButton({ rate, cycleRate }: Pick<AudioPlayer, "rate" | "cycleRate">) {
  const { audio } = useLocale().strings;
  return (
    <IconButton label={fillTemplate(audio.playbackRate, { rate })} onClick={cycleRate} className="min-w-12 px-2 text-label font-semibold tabular-nums">
      {rate}×
    </IconButton>
  );
}

export function PlayerControls({ player, downloadUrl, downloadName }: PlayerControlsProps) {
  const { audio } = useLocale().strings;
  return (
    <div className="flex items-center">
      {player.duration >= SKIP_WORTHY_DURATION && <SkipButtons skipBy={player.skipBy} />}
      <RateButton rate={player.rate} cycleRate={player.cycleRate} />
      {downloadUrl && (
        <IconLink label={audio.save} href={downloadUrl} download={downloadName}>
          <Download aria-hidden className="size-4" />
        </IconLink>
      )}
    </div>
  );
}
