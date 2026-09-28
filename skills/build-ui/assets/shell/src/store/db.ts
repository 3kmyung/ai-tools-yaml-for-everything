import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Message, Thread } from "../core/messages";

export interface StoredBlob {
  id: string;
  threadId: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

interface HistorySchema extends DBSchema {
  threads: { key: string; value: Thread; indexes: { byUpdatedAt: number } };
  messages: { key: string; value: Message; indexes: { byThread: [string, number] } };
  blobs: { key: string; value: StoredBlob; indexes: { byThread: string } };
}

export type HistoryDatabase = IDBPDatabase<HistorySchema>;

const DATABASE_VERSION = 1;

function createVersionOneStores(database: HistoryDatabase) {
  database.createObjectStore("threads", { keyPath: "id" }).createIndex("byUpdatedAt", "updatedAt");
  database.createObjectStore("messages", { keyPath: "id" }).createIndex("byThread", ["threadId", "createdAt"]);
  database.createObjectStore("blobs", { keyPath: "id" }).createIndex("byThread", "threadId");
}

export function openHistoryDatabase(name: string): Promise<HistoryDatabase> {
  return openDB<HistorySchema>(name, DATABASE_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) createVersionOneStores(database);
    },
  });
}

let sharedDatabase: Promise<HistoryDatabase> | null = null;

export function configureSharedDatabase(name: string): void {
  sharedDatabase ??= openHistoryDatabase(name);
}

export function getSharedDatabase(): Promise<HistoryDatabase> {
  if (!sharedDatabase) return Promise.reject(new Error("configureSharedDatabase was not called"));
  return sharedDatabase;
}
