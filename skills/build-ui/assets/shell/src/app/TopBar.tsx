import { PanelLeft, SquarePen } from "lucide-react";
import { useLocale } from "../i18n/locale-context";
import { IconButton } from "../ui/IconButton";

interface TopBarProps {
  title: string;
  onOpenSidebar: () => void;
  onNewThread: () => void;
}

export function TopBar({ title, onOpenSidebar, onNewThread }: TopBarProps) {
  const { strings } = useLocale();

  return (
    <header className="surface-blur sticky top-0 z-20 flex h-14 items-center justify-between px-2 md:hidden">
      <IconButton label={strings.sidebar.open} onClick={onOpenSidebar}>
        <PanelLeft aria-hidden className="size-5" />
      </IconButton>
      <span className="truncate px-2 text-body-lg font-semibold">{title}</span>
      <IconButton label={strings.sidebar.newRun} onClick={onNewThread}>
        <SquarePen aria-hidden className="size-[18px]" />
      </IconButton>
    </header>
  );
}
