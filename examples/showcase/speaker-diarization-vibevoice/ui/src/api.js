import { createWebSocketClient, socketUrlFor } from "./websocket-client.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:8080/api";
const WORKFLOW_ID = "transcribe-meeting";

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

  return {
    workflowSchema: async () => {
      const response = await fetch(url + "/workflows/" + WORKFLOW_ID + "/schema");

      if (!response.ok) throw new Error(await readError(response));

      return response.json();
    },

    startTranscription: async (audioFile, contextInfo) => {
      return socket.runWorkflow(WORKFLOW_ID, {
        audio: socket.streamFile(audioFile),
        context_info: contextInfo,
      });
    },

    watchTask: async (taskId, onState) => {
      return socket.watchTask(taskId, onState);
    },

    cancelTask: async (taskId) => {
      const response = await fetch(url + "/tasks/" + taskId + "/cancel", { method: "POST" });

      if (!response.ok) throw new Error(await readError(response));
    },
  };
}
