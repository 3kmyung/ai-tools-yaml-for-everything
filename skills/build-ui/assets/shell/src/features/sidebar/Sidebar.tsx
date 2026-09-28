import { SquarePen, X } from "lucide-react";
import { useState } from "react";
import type { TitledThread } from "../../core/request-summary";
import { useLocale } from "../../i18n/locale-context";
import { classNames } from "../../lib/class-names";
import { IconButton } from "../../ui/IconButton";
import { SIDEBAR_EDGE } from "../../ui/styles/surface-classes";
import { DeleteThreadSheet } from "./DeleteThreadSheet";
import { LanguageSwitch } from "./LanguageSwitch";
import { ThreadList } from "./ThreadList";

interface SidebarProps {
  name: string;
  threads: readonly TitledThread[];
  activeThreadId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onDeleteThread: (threadId: string) => void;
}

function SidebarHeader({ name, onNewThread, onClose }: Pick<SidebarProps, "name" | "onNewThread" | "onClose">) {
  const { sidebar } = useLocale().strings;
  return (
    <div className="flex h-14 items-center justify-between pr-2 pl-5">
      <span className="truncate font-display text-title font-semibold tracking-tight">{name}</span>
      <div className="flex items-center">
        <IconButton label={sidebar.newRun} onClick={onNewThread}>
          <SquarePen aria-hidden className="size-[18px]" />
        </IconButton>
        <IconButton label={sidebar.close} onClick={onClose} className="md:hidden">
          <X aria-hidden className="size-[18px]" />
        </IconButton>
      </div>
    </div>
  );
}

export function Sidebar({ name, isOpen, onClose, onNewThread, onSelectThread, onRenameThread, onDeleteThread, ...listProps }: SidebarProps) {
  const { sidebar } = useLocale().strings;
  const [threadToDelete, setThreadToDelete] = useState<TitledThread | null>(null);
  const confirmDelete = (threadId: string) => {
    setThreadToDelete(null);
    onDeleteThread(threadId);
  };

  return (
    <>
      <div aria-hidden onClick={onClose} className={classNames("fixed inset-0 z-30 bg-scrim md:hidden", !isOpen && "hidden")} />
      <aside
        className={classNames(
          "fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col transition-transform duration-300 md:static md:translate-x-0",
          SIDEBAR_EDGE,
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarHeader name={name} onNewThread={onNewThread} onClose={onClose} />
        <nav aria-label={sidebar.history} className="flex-1 overflow-y-auto px-2 pb-4">
          <ThreadList {...listProps} onSelect={onSelectThread} onRename={onRenameThread} onRequestDelete={setThreadToDelete} />
        </nav>
        <div className="px-3 pb-3">
          <LanguageSwitch />
        </div>
      </aside>
      <DeleteThreadSheet thread={threadToDelete} onCancel={() => setThreadToDelete(null)} onConfirm={confirmDelete} />
    </>
  );
}
