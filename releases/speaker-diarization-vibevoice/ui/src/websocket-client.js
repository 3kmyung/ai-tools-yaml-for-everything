const RECONNECT_DELAYS = [250, 500, 1000, 2000, 4000, 8000];
const RECONNECT_ATTEMPT_LIMIT = 8;
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(String(status).toLowerCase());
}

export function socketUrlFor(baseUrl) {
  return String(baseUrl).replace(/^http/, "ws") + "/ws";
}

function encodeChunkFrame(streamId, sequence, chunk) {
  const identifier = new TextEncoder().encode(streamId);
  const frame = new Uint8Array(2 + identifier.length + 4 + chunk.length);
  const header = new DataView(frame.buffer);

  header.setUint16(0, identifier.length);
  frame.set(identifier, 2);
  header.setUint32(2 + identifier.length, sequence);
  frame.set(chunk, 2 + identifier.length + 4);

  return frame;
}

function messageError(message, fallback) {
  const data = message && message.data ? message.data : {};

  return new Error(data.message || data.code || fallback);
}

export function createWebSocketClient(url) {
  const pending = new Map();
  const tasks = new Map();
  const uploads = new Map();

  let socket = null;
  let connecting = null;
  let reconnectAttempt = 0;
  let nextIdentifier = 1;

  function identify(prefix) {
    const serial = nextIdentifier;
    nextIdentifier += 1;

    return prefix + "-" + serial;
  }

  function openSocket() {
    if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
    if (connecting) return connecting;

    connecting = new Promise((resolve, reject) => {
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
        if (typeof event.data !== "string") return;

        receive(JSON.parse(event.data));
      };

      opening.onclose = () => {
        const wasOpen = socket === opening;

        if (opening === socket) socket = null;
        if (connecting) connecting = null;

        failPending(new Error("The connection to the server was lost."));

        if (wasOpen) scheduleReconnect();
        else reject(new Error("The server could not be reached."));
      };
    });

    return connecting;
  }

  function scheduleReconnect() {
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

  function resubscribeTasks() {
    tasks.forEach((entry, taskId) => {
      if (entry.done || !entry.watchers.size) return;

      entry.subscribed = false;

      request("subscribe_task", { task_id: taskId })
        .catch((subscribeFailure) => failTask(taskId, subscribeFailure));
    });
  }

  function failPending(error) {
    const waiting = [...pending.values()];

    pending.clear();
    waiting.forEach((request) => request.reject(error));
  }

  function failWatchers(error) {
    tasks.forEach((entry, taskId) => failTask(taskId, error));
  }

  function failTask(taskId, error) {
    const entry = tasks.get(taskId);

    if (!entry) return;

    const watchers = [...entry.watchers];

    entry.watchers.clear();
    watchers.forEach((watcher) => watcher.reject(error));
  }

  function receive(message) {
    const waiting = message.id != null ? pending.get(message.id) : null;

    if (waiting) {
      pending.delete(message.id);

      if (message.type === "error") waiting.reject(messageError(message, "The request failed."));
      else waiting.resolve(message.data || {});
    }

    if (message.type === "task_state") deliverState(message.data.task_id, message.data);
    if (message.type === "task_subscribed") acceptSubscription(message.data);
    if (message.type === "stream_pull") pushChunk(message.data.id);
    if (message.type === "stream_close") releaseUpload(message.data.id);
  }

  function acceptSubscription(data) {
    const entry = tasks.get(data.task_id);

    if (entry) entry.subscribed = true;

    deliverState(data.task_id, data.state);
  }

  function deliverState(taskId, state) {
    const entry = tasks.get(taskId);

    if (!entry || !state) return;

    entry.state = state;
    entry.done = isTerminalStatus(state.status);

    [...entry.watchers].forEach((watcher) => notify(entry, watcher, state));
  }

  function notify(entry, watcher, state) {
    if (watcher.onState) watcher.onState(state);

    if (!isTerminalStatus(state.status)) return;

    entry.watchers.delete(watcher);
    watcher.resolve(state);
  }

  function trackTask(taskId) {
    if (!tasks.has(taskId)) {
      tasks.set(taskId, { state: null, subscribed: false, done: false, watchers: new Set() });
    }

    return tasks.get(taskId);
  }

  async function send(message) {
    const open = await openSocket();

    open.send(JSON.stringify(message));
  }

  async function request(type, data) {
    const identifier = identify("message");

    const answer = new Promise((resolve, reject) => {
      pending.set(identifier, { resolve: resolve, reject: reject });
    });

    try {
      await send({ type: type, id: identifier, data: data || {} });
    } catch (sendFailure) {
      pending.delete(identifier);
      throw sendFailure;
    }

    return answer;
  }

  function streamFile(file) {
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

  async function pushChunk(streamId) {
    const upload = uploads.get(streamId);

    if (!upload) return;

    let chunk;

    try {
      chunk = await upload.reader.read();
    } catch (readFailure) {
      uploads.delete(streamId);
      await send({ type: "stream_abort", data: { id: streamId, reason: String(readFailure) } });

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

  function releaseUpload(streamId) {
    const upload = uploads.get(streamId);

    if (!upload) return;

    uploads.delete(streamId);
    upload.reader.cancel().catch(() => {});
  }

  async function runWorkflow(workflowId, input) {
    const started = await request("run_workflow", {
      workflow_id: workflowId,
      input: input,
      subscribe_task: true,
    });

    trackTask(started.task_id).subscribed = true;

    return started;
  }

  async function watchTask(taskId, onState) {
    const entry = trackTask(taskId);

    if (!entry.subscribed) await request("subscribe_task", { task_id: taskId });

    return new Promise((resolve, reject) => {
      const watcher = { onState: onState, resolve: resolve, reject: reject };

      entry.watchers.add(watcher);

      if (entry.state) notify(entry, watcher, entry.state);
    });
  }

  async function resumeTask(taskId, jobId) {
    return request("resume_task", { task_id: taskId, job_id: jobId });
  }

  return {
    streamFile: streamFile,
    runWorkflow: runWorkflow,
    watchTask: watchTask,
    resumeTask: resumeTask,
  };
}
