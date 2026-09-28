import { ArrowUp, Square } from "lucide-react";
import { useLocale } from "../../i18n/locale-context";
import { IconButton } from "../../ui/IconButton";

interface SendButtonProps {
  isBusy: boolean;
  isStopping: boolean;
  blockedReason: string | null;
  onStop: () => void;
}

export function SendButton({ isBusy, isStopping, blockedReason, onStop }: SendButtonProps) {
  const { composer } = useLocale().strings;

  if (isBusy) {
    return (
      <IconButton data-stop variant="solid" label={isStopping ? composer.stopping : composer.stopRun} disabled={isStopping} onClick={onStop}>
        <Square aria-hidden className="size-3.5 fill-current" />
      </IconButton>
    );
  }

  const isBlocked = blockedReason !== null;
  return (
    <IconButton data-send type="submit" label={composer.run} tooltip={blockedReason ?? composer.run} variant={isBlocked ? "muted" : "solid"} disabled={isBlocked}>
      <ArrowUp aria-hidden className="size-[18px]" strokeWidth={2.4} />
    </IconButton>
  );
}
