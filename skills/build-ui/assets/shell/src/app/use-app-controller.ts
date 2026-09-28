import { useState, type ComponentProps } from "react";
import type { Draft } from "../core/draft";
import type { Release } from "../core/release";
import { titleThread, type TitledThread } from "../core/request-summary";
import { useDraft, type DraftControls } from "../features/composer/use-draft";
import type { Sidebar } from "../features/sidebar/Sidebar";
import { useLocale } from "../i18n/locale-context";
import { useThreads, type ThreadsControls } from "../store/use-threads";
import type { TopBar } from "./TopBar";
import { useRuns, type RunsControls } from "./use-runs";
import type { Workspace } from "./Workspace";

interface AppController {
  sidebar: ComponentProps<typeof Sidebar>;
  topBar: ComponentProps<typeof TopBar>;
  workspace: ComponentProps<typeof Workspace>;
}

interface SidebarWiring {
  name: string;
  threads: ThreadsControls;
  titledThreads: TitledThread[];
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  openThread: (threadId: string | null) => void;
}

function sidebarProps({ name, threads, titledThreads, isOpen, setOpen, openThread }: SidebarWiring): AppController["sidebar"] {
  return {
    name,
    threads: titledThreads,
    activeThreadId: threads.activeThreadId,
    isOpen,
    onClose: () => setOpen(false),
    onNewThread: () => openThread(null),
    onSelectThread: openThread,
    onRenameThread: (threadId, title) => void threads.renameThread(threadId, title),
    onDeleteThread: (threadId) => void threads.removeThread(threadId),
  };
}

function workspaceProps(release: Release, threads: ThreadsControls, runs: RunsControls, draftControls: DraftControls): AppController["workspace"] {
  const submit = (draft: Draft) => {
    if (runs.run(draft)) draftControls.clearSent();
  };
  return {
    release,
    activeThreadId: threads.activeThreadId,
    messages: threads.messages,
    pending: runs.pending,
    isBusy: runs.isBusy,
    draftControls,
    onSubmit: submit,
    onStop: runs.stop,
    onRetry: (prompt) => {
      runs.retry(prompt);
    },
  };
}

export function useAppController(release: Release): AppController {
  const { locale, strings, pick } = useLocale();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const threads = useThreads();
  const runs = useRuns(release, threads);
  const draftControls = useDraft(release);
  const titledThreads = threads.threads.map((thread) => titleThread(release, thread, locale));
  const activeTitle = titledThreads.find((thread) => thread.id === threads.activeThreadId)?.title ?? strings.sidebar.newRun;
  const openThread = (threadId: string | null) => {
    threads.selectThread(threadId);
    setSidebarOpen(false);
  };

  return {
    sidebar: sidebarProps({ name: pick(release.name), threads, titledThreads, isOpen: isSidebarOpen, setOpen: setSidebarOpen, openThread }),
    topBar: { title: activeTitle, onOpenSidebar: () => setSidebarOpen(true), onNewThread: () => openThread(null) },
    workspace: workspaceProps(release, threads, runs, draftControls),
  };
}
