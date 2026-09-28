const RECONNECT_DELAYS = [250, 500, 1000, 2000, 4000, 8000];
const RECONNECT_ATTEMPT_LIMIT = 8;
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];
const CANCEL_CONFLICT_STATUS = 409;

export type StreamKind = "bytes" | "text" | "object";

export interface StreamDescriptor {
  type: "stream";
  id: string;
  kind: StreamKind;
  content_type?: string;
  filename?: string;
  size?: number;
  attrs?: Readonly<Record<string, string>>;
}

export interface TaskState {
  task_id: string;
  status: string;
  output?: unknown;
  error?: string;
}

export interface JobEvent {
  task_id: string;
  workflow_id: string;
  job_id: string;
  event: "started" | "cancelled" | "completed" | "failed" | "routed";
  elapsed?: number;
  output?: unknown;
  error?: string;
}

export interface ControllerClient {
  streamFile: (file: File) => unknown;
  runWorkflow: (workflowId: string, input: unknown) => Promise<TaskState>;
  watchTask: (
    taskId: string,
    onState?: (state: TaskState) => void,
    onJobEvent?: (event: JobEvent) => void,
  ) => Promise<TaskState>;
  pullStream: (descriptor: StreamDescriptor, onChunk?: (chunk: unknown) => void) => Promise<unknown[]>;
  resumeTask: (taskId: string, jobId: string) => Promise<unknown>;
  cancelTask: (taskId: string) => Promise<void>;
  close: () => void;
}

interface SocketMessage {
  type: string;
  id?: string;
  data: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

interface TaskWatcher {
  onState?: (state: TaskState) => void;
  onJobEvent?: (event: JobEvent) => void;
  resolve: (state: TaskState) => void;
  reject: (error: Error) => void;
}

interface TaskEntry {
  state: TaskState | null;
  jobEvents: JobEvent[];
  subscribed: boolean;
  done: boolean;
  watchers: Set<TaskWatcher>;
}

interface UploadEntry {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  sequence: number;
}

interface DownloadEntry {
  chunks: unknown[];
  onChunk?: (chunk: unknown) => void;
  resolve: (chunks: unknown[]) => void;
  reject: (error: Error) => void;
}

export function isTerminalStatus(status: unknown): boolean {
  return TERMINAL_STATUSES.includes(String(status).toLowerCase());
}

export function socketUrlFor(baseUrl: string): string {
  return String(baseUrl).replace(/^http/, "ws") + "/ws";
}

export function readStreamDescriptor(value: unknown): StreamDescriptor | null {
  if (typeof value !== "object" || value === null) return null;

  const variable = (value as Record<string, unknown>)["__variable__"];

  if (typeof variable !== "object" || variable === null) return null;

  const candidate = variable as Record<string, unknown>;

  if (candidate["type"] !== "stream" || typeof candidate["id"] !== "string") return null;

  return candidate as unknown as StreamDescriptor;
}

function encodeChunkFrame(streamId: string, sequence: number, chunk: Uint8Array): Uint8Array<ArrayBuffer> {
  const identifier = new TextEncoder().encode(streamId);
  const frame = new Uint8Array(new ArrayBuffer(2 + identifier.length + 4 + chunk.length));
  const header = new DataView(frame.buffer);

  header.setUint16(0, identifier.length);
  frame.set(identifier, 2);
  header.setUint32(2 + identifier.length, sequence);
  frame.set(chunk, 2 + identifier.length + 4);

  return frame;
}

export function decodeChunkFrame(buffer: ArrayBuffer): { id: string; sequence: number; chunk: ArrayBuffer } {
  const header = new DataView(buffer);
  const identifierLength = header.getUint16(0);
  const identifier = new TextDecoder().decode(new Uint8Array(buffer, 2, identifierLength));

  return {
    id: identifier,
    sequence: header.getUint32(2 + identifierLength),
    chunk: buffer.slice(2 + identifierLength + 4),
  };
}

function messageError(message: SocketMessage, fallback: string): Error {
  const data = message.data || {};

  return new Error(String(data["message"] || data["code"] || fallback));
}

export function createControllerClient(baseUrl: string): ControllerClient {
  const url = socketUrlFor(baseUrl);
  const pending = new Map<string, PendingRequest>();
  const tasks = new Map<string, TaskEntry>();
  const uploads = new Map<string, UploadEntry>();
  const downloads = new Map<string, DownloadEntry>();

  let socket: WebSocket | null = null;
  let connecting: Promise<WebSocket> | null = null;
  let reconnectAttempt = 0;
  let nextIdentifier = 1;
  let closedByCaller = false;

  function identify(prefix: string): string {
    const serial = nextIdentifier;
    nextIdentifier += 1;

    return `${prefix}-${serial}`;
  }

  function openSocket(): Promise<WebSocket> {
    if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
    if (connecting) return connecting;

    connecting = new Promise<WebSocket>((resolve, reject) => {
      const opening = new WebSocket(url);
      opening.binaryType = "arraybuffer";

      opening.onopen = () => {
        socket = opening;
        connecting = null;
        reconnectAttempt = 0;

        resubscribeTasks();
        resolve(opening);
      };

      opening.onmessage = (event) => {
        if (typeof event.data === "string") receive(JSON.parse(event.data) as SocketMessage);
        else receiveFrame(event.data as ArrayBuffer);
      };

      opening.onclose = () => {
        const wasOpen = socket === opening;

        if (opening === socket) socket = null;
        if (connecting) connecting = null;

        failPending(new Error("The connection to the server was lost."));

        if (wasOpen && !closedByCaller) scheduleReconnect();
        else if (!wasOpen) reject(new Error("The server could not be reached."));
      };
    });

    return connecting;
  }

  function scheduleReconnect(): void {
    const unfinished = [...tasks.values()].some((entry) => entry.watchers.size);

    if (!unfinished) return;

    if (reconnectAttempt >= RECONNECT_ATTEMPT_LIMIT) {
      failWatchers(new Error("The connection to the server was lost."));

      return;
    }

    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    reconnectAttempt += 1;

    setTimeout(() => {
      openSocket().catch(() => scheduleReconnect());
    }, delay);
  }

  function resubscribeTasks(): void {
    tasks.forEach((entry, taskId) => {
      if (entry.done || !entry.watchers.size) return;

      entry.subscribed = false;

      request("subscribe_task", { task_id: taskId }).catch((failure: Error) => failTask(taskId, failure));
    });
  }

  function failPending(error: Error): void {
    const waiting = [...pending.values()];

    pending.clear();
    waiting.forEach((waiter) => waiter.reject(error));

    const downloading = [...downloads.values()];

    downloads.clear();
    downloading.forEach((download) => download.reject(error));
  }

  function failWatchers(error: Error): void {
    tasks.forEach((_, taskId) => failTask(taskId, error));
  }

  function failTask(taskId: string, error: Error): void {
    const entry = tasks.get(taskId);

    if (!entry) return;

    const watchers = [...entry.watchers];

    entry.watchers.clear();
    watchers.forEach((watcher) => watcher.reject(error));
  }

  function receive(message: SocketMessage): void {
    const waiting = message.id != null ? pending.get(message.id) : null;

    if (waiting) {
      pending.delete(message.id as string);

      if (message.type === "error") waiting.reject(messageError(message, "The request failed."));
      else waiting.resolve(message.data || {});
    }

    if (message.type === "task_state") deliverState(String(message.data["task_id"]), message.data as unknown as TaskState);
    if (message.type === "job_event") deliverJobEvent(message.data as unknown as JobEvent);
    if (message.type === "task_subscribed") acceptSubscription(message.data);
    if (message.type === "stream_pull") pushChunk(String(message.data["id"]));
    if (message.type === "stream_close") releaseUpload(String(message.data["id"]));
    if (message.type === "stream_chunk") acceptChunk(String(message.data["id"]), message.data["value"]);
    if (message.type === "stream_end") finishDownload(String(message.data["id"]));
    if (message.type === "stream_abort") abortDownload(String(message.data["id"]), message.data["reason"]);
  }

  function receiveFrame(buffer: ArrayBuffer): void {
    const frame = decodeChunkFrame(buffer);

    acceptChunk(frame.id, frame.chunk);
  }

  function acceptSubscription(data: Record<string, unknown>): void {
    const entry = tasks.get(String(data["task_id"]));

    if (entry) entry.subscribed = true;

    deliverState(String(data["task_id"]), data["state"] as TaskState);
  }

  function deliverState(taskId: string, state: TaskState | undefined): void {
    const entry = tasks.get(taskId);

    if (!entry || !state) return;

    entry.state = state;
    entry.done = isTerminalStatus(state.status);

    [...entry.watchers].forEach((watcher) => notify(entry, watcher, state));
  }

  function deliverJobEvent(event: JobEvent): void {
    const entry = trackTask(String(event.task_id));

    entry.jobEvents.push(event);

    [...entry.watchers].forEach((watcher) => {
      if (watcher.onJobEvent) watcher.onJobEvent(event);
    });
  }

  function notify(entry: TaskEntry, watcher: TaskWatcher, state: TaskState): void {
    if (watcher.onState) watcher.onState(state);

    if (!isTerminalStatus(state.status)) return;

    entry.watchers.delete(watcher);
    watcher.resolve(state);
  }

  function trackTask(taskId: string): TaskEntry {
    if (!tasks.has(taskId)) {
      tasks.set(taskId, { state: null, jobEvents: [], subscribed: false, done: false, watchers: new Set() });
    }

    return tasks.get(taskId) as TaskEntry;
  }

  async function send(message: SocketMessage): Promise<void> {
    const open = await openSocket();

    open.send(JSON.stringify(message));
  }

  async function request(type: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const identifier = identify("message");

    const answer = new Promise<Record<string, unknown>>((resolve, reject) => {
      pending.set(identifier, { resolve, reject });
    });

    try {
      await send({ type, id: identifier, data: data || {} });
    } catch (failure) {
      pending.delete(identifier);
      throw failure;
    }

    return answer;
  }

  function streamFile(file: File): unknown {
    const streamId = identify("stream");

    uploads.set(streamId, { reader: file.stream().getReader(), sequence: 0 });

    return {
      __variable__: {
        type: "stream",
        id: streamId,
        kind: "bytes",
        content_type: file.type || "application/octet-stream",
        filename: file.name,
        size: file.size,
      },
    };
  }

  async function pushChunk(streamId: string): Promise<void> {
    const upload = uploads.get(streamId);

    if (!upload) return;

    let chunk;

    try {
      chunk = await upload.reader.read();
    } catch (failure) {
      uploads.delete(streamId);
      await send({ type: "stream_abort", data: { id: streamId, reason: String(failure) } });

      return;
    }

    if (chunk.done) {
      uploads.delete(streamId);
      await send({ type: "stream_end", data: { id: streamId } });

      return;
    }

    const open = await openSocket();

    open.send(encodeChunkFrame(streamId, upload.sequence, chunk.value));
    upload.sequence += 1;
  }

  function releaseUpload(streamId: string): void {
    const upload = uploads.get(streamId);

    if (!upload) return;

    uploads.delete(streamId);
    upload.reader.cancel().catch(() => undefined);
  }

  function pullStream(descriptor: StreamDescriptor, onChunk?: (chunk: unknown) => void): Promise<unknown[]> {
    return new Promise<unknown[]>((resolve, reject) => {
      downloads.set(descriptor.id, { chunks: [], onChunk, resolve, reject });

      send({ type: "stream_pull", data: { id: descriptor.id } }).catch((failure: Error) => {
        downloads.delete(descriptor.id);
        reject(failure);
      });
    });
  }

  function acceptChunk(streamId: string, value: unknown): void {
    const download = downloads.get(streamId);

    if (!download) return;

    download.chunks.push(value);

    if (download.onChunk) download.onChunk(value);

    send({ type: "stream_pull", data: { id: streamId } }).catch((failure: Error) => {
      downloads.delete(streamId);
      download.reject(failure);
    });
  }

  function finishDownload(streamId: string): void {
    const download = downloads.get(streamId);

    if (!download) return;

    downloads.delete(streamId);
    download.resolve(download.chunks);
  }

  function abortDownload(streamId: string, reason: unknown): void {
    const download = downloads.get(streamId);

    if (!download) return;

    downloads.delete(streamId);
    download.reject(new Error(typeof reason === "string" && reason ? reason : "The stream was aborted."));
  }

  async function runWorkflow(workflowId: string, input: unknown): Promise<TaskState> {
    const started = await request("run_workflow", {
      workflow_id: workflowId,
      input,
      subscribe_task: true,
    });

    trackTask(String(started["task_id"])).subscribed = true;

    return started as unknown as TaskState;
  }

  async function watchTask(
    taskId: string,
    onState?: (state: TaskState) => void,
    onJobEvent?: (event: JobEvent) => void,
  ): Promise<TaskState> {
    const entry = trackTask(taskId);

    if (!entry.subscribed) await request("subscribe_task", { task_id: taskId });

    return new Promise<TaskState>((resolve, reject) => {
      const watcher: TaskWatcher = { onState, onJobEvent, resolve, reject };

      entry.watchers.add(watcher);

      if (onJobEvent) entry.jobEvents.forEach((event) => onJobEvent(event));
      if (entry.state) notify(entry, watcher, entry.state);
    });
  }

  function resumeTask(taskId: string, jobId: string): Promise<unknown> {
    return request("resume_task", { task_id: taskId, job_id: jobId });
  }

  async function cancelTask(taskId: string): Promise<void> {
    const response = await fetch(`${baseUrl}/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST" });

    if (response.ok || response.status === CANCEL_CONFLICT_STATUS) return;

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    throw new Error(String(body["detail"] || `The task could not be cancelled (${response.status}).`));
  }

  function close(): void {
    closedByCaller = true;

    if (socket) socket.close();
  }

  return { streamFile, runWorkflow, watchTask, pullStream, resumeTask, cancelTask, close };
}
