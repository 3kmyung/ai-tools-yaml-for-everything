import { errorMessage, showInterrupt, showProgress, showResult, showStatus } from "./status.js";

export function createRenderRunner(options) {
  const getApi = options.getApi;
  const buildInput = options.buildInput;
  const hasPendingResolves = options.hasPendingResolves;

  let activeTaskId = null;
  let cancelRequested = false;
  let resumeRequested = false;

  function reportProgress(state) {
    const cancel = async () => {
      cancelRequested = true;
      reportProgress(state);
      try {
        if (activeTaskId) await getApi().cancelTask(activeTaskId);
      } catch (error) {
        showStatus(errorMessage(error, "The render could not be cancelled."));
      }
    };

    if (String(state.status).toLowerCase() === "interrupted") {
      showInterrupt(state, {
        resuming: resumeRequested,
        onCancel: cancel,
        onResume: async () => {
          resumeRequested = true;
          showInterrupt(state, { resuming: true });
          try {
            const jobId = state.interrupt ? state.interrupt.job_id : null;
            if (activeTaskId) await getApi().resumeTask(activeTaskId, jobId);
          } catch (error) {
            resumeRequested = false;
            showStatus(errorMessage(error, "The render could not be resumed."));
          }
        },
      });
      return;
    }

    resumeRequested = false;
    showProgress({ cancelling: cancelRequested, onCancel: cancel });
  }

  async function start() {
    const button = document.getElementById("render-playlist");
    const input = buildInput();

    const incomplete = input.tracks.filter((track) => !track.youtube_url);
    if (!input.tracks.length || incomplete.length) {
      showStatus("Every track needs a YouTube link before rendering.");
      return;
    }

    if (hasPendingResolves()) {
      showStatus("Still reading a YouTube link…");
      return;
    }

    button.disabled = true;
    cancelRequested = false;
    try {
      const started = await getApi().startRender(input);
      activeTaskId = started.task_id;
      reportProgress(started);

      const final = await getApi().watchTask(activeTaskId, reportProgress);
      const status = String(final.status).toLowerCase();

      if (status === "completed") {
        showResult(final.output);
      } else if (status === "cancelled") {
        showStatus("Render cancelled.");
      } else {
        showStatus("Render failed.");
      }
    } catch (error) {
      showStatus(errorMessage(error, "The render could not be completed."));
    } finally {
      activeTaskId = null;
      cancelRequested = false;
      resumeRequested = false;
      button.disabled = false;
    }
  }

  return { start: start };
}
