import { createWebSocketClient, socketUrlFor } from "./websocket-client.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:8080/api";

const VIDEO_ID_PATTERN = /(?:youtu\.be\/|\/(?:embed|shorts|live|v)\/|[?&]v=)([A-Za-z0-9_-]{11})/;

export function youtubeVideoId(url) {
  const match = VIDEO_ID_PATTERN.exec(String(url || ""));

  return match ? match[1] : null;
}

async function readError(response) {
  const text = await response.text();

  try {
    const detail = JSON.parse(text).detail;

    return detail != null ? detail : text;
  } catch (parseFailure) {
    return text || "HTTP " + response.status;
  }
}

export function createApi(baseUrl) {
  const url = baseUrl || DEFAULT_BASE_URL;
  const socket = createWebSocketClient(socketUrlFor(url));

  async function runToCompletion(workflowId, input) {
    const started = await socket.runWorkflow(workflowId, input);
    const final = await socket.watchTask(started.task_id);

    if (String(final.status).toLowerCase() !== "completed") {
      throw new Error(final.error || "The workflow did not complete.");
    }

    return final.output;
  }

  return {
    workflowSchema: async (workflowId) => {
      const response = await fetch(url + "/workflows/" + workflowId + "/schema");

      if (!response.ok) throw new Error(await readError(response));

      return response.json();
    },

    youtubeDefaults: async (videoUrl) => {
      return runToCompletion("resolve-youtube-defaults", {
        youtube_url: videoUrl,
        video_id: youtubeVideoId(videoUrl),
      });
    },

    coverDefaults: async (file) => {
      return runToCompletion("resolve-cover-defaults", { cover_image: socket.streamFile(file) });
    },

    startRender: async (input) => {
      return socket.runWorkflow("render-playlist", input);
    },

    watchTask: async (taskId, onState) => {
      return socket.watchTask(taskId, onState);
    },

    resumeTask: async (taskId, jobId) => {
      return socket.resumeTask(taskId, jobId);
    },

    cancelTask: async (taskId) => {
      const response = await fetch(url + "/tasks/" + taskId + "/cancel", { method: "POST" });

      if (!response.ok) throw new Error(await readError(response));
    },
  };
}
