export type InputValue = string | number | boolean;

export type JobOutputs = Readonly<Record<string, unknown>>;

export interface StoredFile {
  blobId: string;
  name: string;
  type: string;
  size: number;
}

export interface ResultMedia {
  blob_id?: string;
  file?: string;
  content_type: string;
  filename?: string;
  size: number;
  attrs: Readonly<Record<string, string>>;
}

export interface ResultMediaReference {
  __media__: ResultMedia;
}

export function isResultMediaReference(value: unknown): value is ResultMediaReference {
  if (typeof value !== "object" || value === null) return false;

  const media = (value as Record<string, unknown>)["__media__"];

  if (typeof media !== "object" || media === null) return false;

  return typeof (media as Record<string, unknown>)["content_type"] === "string";
}

export interface RunRequest {
  workflowId: string;
  texts: Readonly<Record<string, string>>;
  files: Readonly<Record<string, StoredFile>>;
  options: Readonly<Record<string, InputValue>>;
}

export interface Thread {
  id: string;
  title: string | null;
  workflowId: string;
  createdAt: number;
  updatedAt: number;
}

interface MessageBase {
  id: string;
  threadId: string;
  createdAt: number;
}

export interface UserMessage extends MessageBase {
  kind: "user";
  request: RunRequest;
}

export interface ResultMessage extends MessageBase {
  kind: "result";
  replyTo: string;
  result: unknown;
  outputs: JobOutputs;
  elapsedMilliseconds: number;
}

export interface ErrorMessage extends MessageBase {
  kind: "error";
  replyTo: string;
  reason: string;
  detail: string;
}

export type Reply = ResultMessage | ErrorMessage;

export type Message = UserMessage | Reply;
