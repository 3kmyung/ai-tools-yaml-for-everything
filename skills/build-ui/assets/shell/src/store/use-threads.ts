import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Message, Thread } from "../core/messages";
import { getSharedDatabase } from "./db";
import { listMessages } from "./message-repo";
import { deleteThread, listThreads, updateThread } from "./thread-repo";

export interface ThreadsControls {
  threads: Thread[];
  activeThreadId: string | null;
  messages: Message[];
  selectThread: (threadId: string | null) => void;
  reload: () => Promise<void>;
  renameThread: (threadId: string, title: string) => Promise<void>;
  removeThread: (threadId: string) => Promise<void>;
}

async function loadThreadState(threadId: string | null) {
  const database = await getSharedDatabase();
  const [threads, messages] = await Promise.all([
    listThreads(database),
    threadId ? listMessages(database, threadId) : Promise.resolve([]),
  ]);
  return { threads, messages };
}

function useActiveThread() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const activeThreadRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const threadId = activeThreadRef.current;
    const next = await loadThreadState(threadId);
    if (threadId !== activeThreadRef.current) return;
    setThreads(next.threads);
    setMessages(next.messages);
  }, []);

  const selectThread = useCallback((threadId: string | null) => {
    activeThreadRef.current = threadId;
    setActiveThreadId(threadId);
    if (!threadId) setMessages([]);
    void reload();
  }, [reload]);

  return { threads, activeThreadId, messages, activeThreadRef, reload, selectThread };
}

function useThreadMutations(activeThreadRef: RefObject<string | null>, reload: () => Promise<void>, selectThread: (threadId: string | null) => void) {
  const renameThread = useCallback(async (threadId: string, title: string) => {
    await updateThread(await getSharedDatabase(), threadId, { title });
    await reload();
  }, [reload]);

  const removeThread = useCallback(async (threadId: string) => {
    await deleteThread(await getSharedDatabase(), threadId);
    if (activeThreadRef.current === threadId) return selectThread(null);
    await reload();
  }, [activeThreadRef, reload, selectThread]);

  return { renameThread, removeThread };
}

export function useThreads(): ThreadsControls {
  const { threads, activeThreadId, messages, activeThreadRef, reload, selectThread } = useActiveThread();
  const { renameThread, removeThread } = useThreadMutations(activeThreadRef, reload, selectThread);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { threads, activeThreadId, messages, selectThread, reload, renameThread, removeThread };
}
