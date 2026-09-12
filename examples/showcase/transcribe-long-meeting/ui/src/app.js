import { createApi } from "./api.js";
import { createDropzone } from "./dropzone.js";
import { readHotwords } from "./hotwords.js";
import { markSelectedListItem, renderSegmentList, segmentsFromResponse } from "./segments.js";
import { markSelectedTimelineBlock, renderTimeline } from "./timeline.js";
import { errorMessage, hideStatus, showFinished, showProgress, showStatus } from "./status.js";

const HEAVY_DURATION_SECONDS = 30 * 60;
const TASK_STORAGE_KEY = "transcribe-long-meeting/task";

const api = createApi();

let selectedFile = null;
let segments = [];
let selectedIndex = null;
let activeTaskId = null;
let cancelRequested = false;

function rememberTask(taskId) {
  activeTaskId = taskId;

  try {
    sessionStorage.setItem(TASK_STORAGE_KEY, taskId);
  } catch (persistFailure) {}
}

function forgetTask() {
  activeTaskId = null;

  try {
    sessionStorage.removeItem(TASK_STORAGE_KEY);
  } catch (persistFailure) {}
}

function rememberedTask() {
  try {
    return sessionStorage.getItem(TASK_STORAGE_KEY);
  } catch (readFailure) {
    return null;
  }
}

function selectSegment(index) {
  selectedIndex = index;

  markSelectedListItem(document.querySelector("#segments ol"), selectedIndex);
  markSelectedTimelineBlock(document.getElementById("timeline"), selectedIndex);
}

function deselectSegment() {
  selectedIndex = null;

  markSelectedListItem(document.querySelector("#segments ol"), selectedIndex);
  markSelectedTimelineBlock(document.getElementById("timeline"), selectedIndex);
}

function renderResults() {
  const hint = document.getElementById("hint");
  const segmentsHint = document.getElementById("segments-hint");
  const dropzoneSection = document.getElementById("dropzone");
  const timelineSection = document.getElementById("timeline");
  const segmentList = document.querySelector("#segments ol");

  const hasResults = segments.length > 0;

  hint.hidden = selectedFile != null || hasResults;
  segmentsHint.hidden = hasResults;
  dropzoneSection.hidden = hasResults;
  timelineSection.hidden = !hasResults;

  renderSegmentList(segmentList, segments, { selectedIndex: selectedIndex, onSelect: selectSegment });

  if (hasResults) renderTimeline(timelineSection, segments, { selectedIndex: selectedIndex, onSelect: selectSegment });
}

function applyTranscription(output) {
  segments = segmentsFromResponse((output && output.transcription) || []);
  selectedIndex = segments.length ? 0 : null;

  renderResults();
}

function updateDurationWarning(durationSeconds) {
  const warning = document.getElementById("warning");
  const heavy = durationSeconds != null && durationSeconds > HEAVY_DURATION_SECONDS;

  warning.hidden = !heavy;
  warning.textContent = heavy ? "Expect a long transcription for a recording this size." : "";
}

function setFile(file) {
  selectedFile = file;

  renderResults();
}

function resetForNewFile() {
  selectedFile = null;
  segments = [];
  selectedIndex = null;

  dropzoneController.reset();
  updateDurationWarning(null);
  hideStatus();
  renderResults();
}

function reportProgress(state) {
  const cancel = async () => {
    cancelRequested = true;
    reportProgress(state);

    try {
      if (activeTaskId) await api.cancelTask(activeTaskId);
    } catch (cancelFailure) {
      cancelRequested = false;
      reportProgress(state);
    }
  };

  showProgress({ cancelling: cancelRequested, onCancel: cancel });
}

async function follow(reattaching) {
  const transcribe = document.getElementById("transcribe");
  let reported = false;

  transcribe.disabled = true;

  try {
    const final = await api.watchTask(activeTaskId, (state) => {
      reported = true;
      reportProgress(state);
    });

    const status = String(final.status).toLowerCase();

    if (status === "completed") {
      forgetTask();
      applyTranscription(final.output);
      showFinished("Transcription complete.", resetForNewFile);
    } else if (status === "cancelled") {
      forgetTask();
      showStatus("Transcription cancelled.");
    } else {
      forgetTask();
      showStatus("Transcription failed.");
    }
  } catch (followFailure) {
    forgetTask();

    if (reported || !reattaching) showStatus(errorMessage(followFailure, "The transcription could not be completed."));
  } finally {
    cancelRequested = false;
    transcribe.disabled = false;
  }
}

async function start() {
  const transcribe = document.getElementById("transcribe");

  if (!selectedFile) {
    showStatus("Choose an audio file before transcribing.");
    return;
  }

  segments = [];
  selectedIndex = null;
  renderResults();

  transcribe.disabled = true;
  cancelRequested = false;

  let started = null;

  try {
    started = await api.startTranscription(selectedFile, readHotwords(document.getElementById("hotwords")));
  } catch (startFailure) {
    showStatus(errorMessage(startFailure, "The transcription could not be started."));
    transcribe.disabled = false;
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

async function loadFixtureIfBackendUnreachable() {
  try {
    await api.workflowSchema();
    return;
  } catch (schemaFailure) {}

  try {
    const response = await fetch("./fixture.json");
    if (!response.ok) return;

    applyTranscription(await response.json());
    showFinished("Showing sample output.", resetForNewFile);
  } catch (fixtureFailure) {}
}

const dropzoneController = createDropzone(document.getElementById("dropzone"), {
  onFile: setFile,
  onDuration: updateDurationWarning,
});

document.getElementById("transcribe").addEventListener("click", start);
document.getElementById("transcribe-compact").addEventListener("click", () => {
  document.getElementById("transcribe").click();
});
document.getElementById("back-to-segments").addEventListener("click", deselectSegment);

renderResults();
await reattach();
await loadFixtureIfBackendUnreachable();
