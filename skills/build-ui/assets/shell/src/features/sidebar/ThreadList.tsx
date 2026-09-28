import { groupThreadsByRecency } from "../../core/group-threads";
import type { TitledThread } from "../../core/request-summary";
import { useLocale } from "../../i18n/locale-context";
import { ThreadItem } from "./ThreadItem";

interface ThreadListProps {
  threads: readonly TitledThread[];
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onRename: (threadId: string, title: string) => void;
  onRequestDelete: (thread: TitledThread) => void;
}

export function ThreadList({ threads, activeThreadId, ...actions }: ThreadListProps) {
  const { strings } = useLocale();
  const groups = groupThreadsByRecency(threads, Date.now());

  if (groups.length === 0) {
    return <p className="px-3 py-2 text-label text-ink-tertiary">{strings.sidebar.emptyHistory}</p>;
  }

  return groups.map((group) => (
    <section key={group.recency} className="mt-4 first:mt-1">
      <h2 className="px-3 pb-1 text-caption font-medium text-ink-tertiary">{strings.recency[group.recency]}</h2>
      <ul>
        {group.threads.map((thread) => (
          <ThreadItem key={thread.id} thread={thread} isActive={thread.id === activeThreadId} {...actions} />
        ))}
      </ul>
    </section>
  ));
}
