/*
 * The GUI is served from :8081 and the workflow adapter listens on :8080, so
 * every call here is cross-origin. The adapter already sends permissive CORS
 * headers, so this needs no proxy — but it does mean the base URL cannot be
 * inferred from location.origin.
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:8080/api";

async function readError(response) {
  const text = await response.text();
  try {
    return JSON.parse(text).detail ?? text;
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

export function createApi(baseUrl = DEFAULT_BASE_URL) {
  async function runJson(workflowId, input, extra = {}) {
    const response = await fetch(`${baseUrl}/workflows/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_id: workflowId, input, ...extra }),
    });
    if (!response.ok) throw new Error(await readError(response));
    return response.json();
  }

  return {
    async youtubeDefaults(url) {
      return runJson(
        "resolve-youtube-defaults",
        { youtube_url: url },
        { wait_for_completion: true, output_only: true }
      );
    },

    /*
     * The one multipart call. It carries exactly one file, which is why the
     * playlist submit below can stay pure JSON — the nested form parser has
     * no indexed-array form, so a list of tracks each holding an upload
     * cannot be expressed as multipart at all.
     */
    async coverDefaults(file) {
      const form = new FormData();
      form.append("workflow_id", "resolve-cover-defaults");
      form.append("wait_for_completion", "true");
      form.append("output_only", "true");
      form.append("input.cover_image", file, file.name);

      const response = await fetch(`${baseUrl}/workflows/runs`, { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response));
      return response.json();
    },

    async startRender(input) {
      return runJson("render-playlist", input, { wait_for_completion: false });
    },

    /*
     * Polls rather than using the adapter's WebSocket. subscribe_task needs a
     * session id from an already-open socket, which is a second connection to
     * keep alive for a signal that arrives a handful of times over several
     * minutes. A poll is less machinery for the same information.
     */
    async watchTask(taskId, onState, intervalMs = 1500) {
      // INTERRUPTED is a real TaskStatus — it means the job is paused
      // waiting for a human answer via POST /tasks/{id}/resume — and is
      // deliberately left out of this list. Treating it as terminal would
      // resolve this promise with no output and no error. Nothing in this
      // example's model-compose.yml can produce it today, but if that ever
      // changes, note that this loop has no abort of its own: an
      // INTERRUPTED task would poll forever unless something upstream
      // learns to resume or cancel it.
      const terminal = ["completed", "failed", "cancelled"];

      for (;;) {
        const response = await fetch(`${baseUrl}/tasks/${taskId}`);
        if (!response.ok) throw new Error(await readError(response));

        const state = await response.json();
        onState?.(state);

        if (terminal.includes(String(state.status).toLowerCase())) return state;

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    },

    async cancelTask(taskId) {
      const response = await fetch(`${baseUrl}/tasks/${taskId}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
    },
  };
}
