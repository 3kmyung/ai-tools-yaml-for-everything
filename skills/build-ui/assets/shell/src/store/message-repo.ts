import type { Message } from "../core/messages";
import type { HistoryDatabase } from "./db";

export function threadMessageRange(threadId: string): IDBKeyRange {
  return IDBKeyRange.bound([threadId, -Infinity], [threadId, Infinity]);
}

export function listMessages(database: HistoryDatabase, threadId: string): Promise<Message[]> {
  return database.getAllFromIndex("messages", "byThread", threadMessageRange(threadId));
}

export async function addMessage(database: HistoryDatabase, message: Message): Promise<void> {
  await database.put("messages", message);
}
