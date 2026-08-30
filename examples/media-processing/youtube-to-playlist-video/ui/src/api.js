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

  async function runJson(workflowId, input, extra) {
    const body = Object.assign({ workflow_id: workflowId, input: input }, extra || {});
    const response = await fetch(url + "/workflows/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await readError(response));
    return response.json();
  }

  return {
    workflowSchema: async (workflowId) => {
      const response = await fetch(url + "/workflows/" + workflowId + "/schema");
      if (!response.ok) throw new Error(await readError(response));
      return response.json();
    },

    youtubeDefaults: async (videoUrl) => {
      return runJson(
        "resolve-youtube-defaults",
        { youtube_url: videoUrl, video_id: youtubeVideoId(videoUrl) },
        { wait_for_completion: true, output_only: true }
      );
    },

    coverDefaults: async (file) => {
      const form = new FormData();
      form.append("workflow_id", "resolve-cover-defaults");
      form.append("wait_for_completion", "true");
      form.append("output_only", "true");
      form.append("input.cover_image", file, file.name);

      const response = await fetch(url + "/workflows/runs", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response));

      return response.json();
    },

    startRender: async (input) => {
      return runJson("render-playlist", input, { wait_for_completion: false });
    },

    watchTask: async (taskId, onState, intervalMilliseconds) => {
      const interval = intervalMilliseconds || 1500;
      const terminal = ["completed", "failed", "cancelled"];

      for (;;) {
        const response = await fetch(url + "/tasks/" + taskId);
        if (!response.ok) throw new Error(await readError(response));

        const state = await response.json();
        if (onState) onState(state);

        if (terminal.includes(String(state.status).toLowerCase())) return state;

        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    },

    resumeTask: async (taskId, jobId) => {
      const response = await fetch(url + "/tasks/" + taskId + "/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!response.ok) throw new Error(await readError(response));
      return response.json();
    },

    cancelTask: async (taskId) => {
      const response = await fetch(url + "/tasks/" + taskId + "/cancel", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
    },
  };
}
