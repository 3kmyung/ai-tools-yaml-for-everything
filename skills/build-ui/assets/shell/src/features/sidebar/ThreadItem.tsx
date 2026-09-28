import { Pencil, Trash } from "lucide-react";
import { useState } from "react";
import type { TitledThread } from "../../core/request-summary";
import { useLocale } from "../../i18n/locale-context";
import { classNames } from "../../lib/class-names";
import { IconButton } from "../../ui/IconButton";
import { ThreadTitleInput } from "./ThreadTitleInput";

interface ThreadItemProps {
  thread: TitledThread;
  isActive: boolean;
  onSelect: (threadId: string) => void;
  onRename: (threadId: string, title: string) => void;
  onRequestDelete: (thread: TitledThread) => void;
}

function ThreadActions({ isPinned, onRename, onDelete }: { isPinned: boolean; onRename: () => void; onDelete: () => void }) {
  const { sidebar } = useLocale().strings;
  return (
    <div className={classNames("absolute inset-y-0 right-1.5 items-center group-focus-within:flex group-hover:flex", isPinned ? "flex" : "hidden")}>
      <IconButton size="sm" label={sidebar.rename} onClick={onRename}>
        <Pencil aria-hidden className="size-3.5" />
      </IconButton>
      <IconButton size="sm" label={sidebar.delete} onClick={onDelete}>
        <Trash aria-hidden className="size-3.5" />
      </IconButton>
    </div>
  );
}

function ThreadLink({ thread, isActive, onSelect }: Pick<ThreadItemProps, "thread" | "isActive" | "onSelect">) {
  return (
    <button
      type="button"
      data-thread-link
      aria-current={isActive ? "page" : undefined}
      onClick={() => onSelect(thread.id)}
      className={classNames(
        "block w-full truncate rounded-row py-2 pr-16 pl-3 text-left text-body transition-colors",
        isActive ? "bg-surface-hover text-ink" : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
      )}
    >
      {thread.title}
    </button>
  );
}

export function ThreadItem({ thread, isActive, onSelect, onRename, onRequestDelete }: ThreadItemProps) {
  const [isEditing, setEditing] = useState(false);

  if (isEditing) {
    const finishEditing = (title: string | null) => {
      setEditing(false);
      if (title) onRename(thread.id, title);
    };
    return (
      <li>
        <ThreadTitleInput initialTitle={thread.title} onDone={finishEditing} />
      </li>
    );
  }

  return (
    <li className="group relative">
      <ThreadLink thread={thread} isActive={isActive} onSelect={onSelect} />
      <ThreadActions isPinned={isActive} onRename={() => setEditing(true)} onDelete={() => onRequestDelete(thread)} />
    </li>
  );
}
