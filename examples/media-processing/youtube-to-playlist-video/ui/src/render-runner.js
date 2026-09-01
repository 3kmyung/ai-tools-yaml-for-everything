import { errorMessage, showInterrupt, showProgress, showResult, showStatus } from "./status.js";

const STORAGE_KEY = "youtube-to-playlist-video/render-task";

export function createRenderRunner(options) {
  const getApi = options.getApi;
  const buildInput = options.buildInput;
  const hasPendingResolves = options.hasPendingResolves;

  let activeTaskId = null;
  let cancelRequested = false;
  let resumeRequested = false;

  function rememberTask(taskId) {
    activeTaskId = taskId;
    try {
      sessionStorage.setItem(STORAGE_KEY, taskId);
    } catch (persistFailure) {}
  }

  function forgetTask() {
    activeTaskId = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (persistFailure) {}
  }

  function rememberedTask() {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch (readFailure) {
      return null;
    }
  }

  function reportProgress(state) {
    const cancel = async () => {
      cancelRequested = true;
      reportProgress(state);
      try {
        if (activeTaskId) await getApi().cancelTask(activeTaskId);
      } catch (error) {
        cancelRequested = false;
        reportProgress(state);
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

  async function follow(reattaching) {
    const button = document.getElementById("render-playlist");
    let reported = false;

    button.disabled = true;
    try {
      const final = await getApi().watchTask(activeTaskId, (state) => {
        reported = true;
        reportProgress(state);
      });
      const status = String(final.status).toLowerCase();

      if (status === "completed") {
        showResult(final.output);
      } else if (status === "cancelled") {
        forgetTask();
        showStatus("Render cancelled.");
      } else {
        forgetTask();
        showStatus("Render failed.");
      }
    } catch (error) {
      forgetTask();
      if (reported || !reattaching) {
        showStatus(errorMessage(error, "The render could not be completed."));
      }
    } finally {
      cancelRequested = false;
      resumeRequested = false;
      button.disabled = false;
    }
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

    let started = null;
    try {
      started = await getApi().startRender(input);
    } catch (error) {
      showStatus(errorMessage(error, "The render could not be completed."));
      button.disabled = false;
      return;
    }

    rememberTask(started.task_id);
    reportProgress(started);
    await follow(false);
  }

  async function reattach() {
    const taskId = rememberedTask();
    if (!taskId) return;

    rememberTask(taskId);
    await follow(true);
  }

  return { start: start, reattach: reattach };
}
