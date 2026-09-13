import { createApi } from "./api.js";
import { createDropzone } from "./dropzone.js";
import { readHotwords } from "./hotwords.js";
import { renderSegmentDetail } from "./segment-detail.js";
import { markSelectedListItem, renderSegmentList } from "./segment-list.js";
import { firstSpokenIndex, segmentsFromResponse } from "./segments.js";
import { errorMessage, hideStatus, showFinished, showProgress, showStatus } from "./status.js";
import { markSelectedTimelineBlock, renderTimeline } from "./timeline.js";

const HEAVY_DURATION_SECONDS = 30 * 60;
const TASK_STORAGE_KEY = "speaker-diarization-vibevoice/task";

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

function setTranscribeDisabled(disabled) {
  const buttons = document.querySelectorAll("#transcribe, #transcribe-compact");

  buttons.forEach((button) => {
    button.disabled = disabled;
  });
}

function showSelection() {
  markSelectedListItem(document.getElementById("segment-list"), selectedIndex);
  markSelectedTimelineBlock(document.getElementById("timeline-scroller"), selectedIndex);
  renderSegmentDetail(document.getElementById("detail"), segments, selectedIndex);
}

function selectSegment(index) {
  selectedIndex = index;

  showSelection();
}

function returnToList() {
  const previousItem = document.querySelectorAll("#segment-list .item-select")[selectedIndex];

  selectedIndex = null;

  showSelection();

  if (previousItem) previousItem.focus();
}

function renderResults() {
  const hasResults = segments.length > 0;
  const selection = { selectedIndex: selectedIndex, onSelect: selectSegment };

  document.getElementById("hint").hidden = selectedFile !== null || hasResults;
  document.getElementById("segments-hint").hidden = hasResults;
  document.getElementById("dropzone").hidden = hasResults;
  document.getElementById("timeline").hidden = !hasResults;

  renderSegmentList(document.getElementById("segment-list"), segments, selection);
  renderTimeline(document.getElementById("timeline-scroller"), document.getElementById("timeline-legend"), segments, selection);
  renderSegmentDetail(document.getElementById("detail"), segments, selectedIndex);
}

function applyTranscription(output) {
  segments = segmentsFromResponse((output && output.transcription) || []);
  selectedIndex = firstSpokenIndex(segments);

  renderResults();
}

function updateDurationWarning(durationSeconds) {
  const warning = document.getElementById("warning");
  const heavy = durationSeconds != null && durationSeconds > HEAVY_DURATION_SECONDS;

  warning.textContent = heavy ? "Expect a long transcription for a recording this size." : "";
  warning.hidden = !heavy;
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

function reportProgress() {
  showProgress({ cancelling: cancelRequested, onCancel: requestCancel });
}

async function requestCancel() {
  cancelRequested = true;

  reportProgress();

  try {
    if (activeTaskId) await api.cancelTask(activeTaskId);
  } catch (cancelFailure) {
    cancelRequested = false;
    reportProgress();
  }
}

async function follow(reattaching) {
  let reported = false;
  const onState = () => {
    reported = true;
    reportProgress();
  };

  setTranscribeDisabled(true);

  try {
    const finalState = await api.watchTask(activeTaskId, onState);
    const status = String(finalState.status).toLowerCase();

    forgetTask();

    if (status === "completed") {
      applyTranscription(finalState.output);
      showFinished("Transcription complete.", resetForNewFile);
    } else if (status === "cancelled") {
      showStatus("Transcription cancelled.");
    } else {
      showStatus("Transcription failed.");
    }
  } catch (followFailure) {
    forgetTask();

    if (reported || !reattaching) showStatus(errorMessage(followFailure, "The transcription could not be completed."));
  } finally {
    cancelRequested = false;
    setTranscribeDisabled(false);
  }
}

async function start() {
  const hotwords = readHotwords(document.getElementById("hotwords"));

  if (!selectedFile) {
    showStatus("Choose an audio file before transcribing.");
    return;
  }

  segments = [];
  selectedIndex = null;
  cancelRequested = false;

  renderResults();
  setTranscribeDisabled(true);

  try {
    const started = await api.startTranscription(selectedFile, hotwords);

    rememberTask(started.task_id);
    reportProgress();
  } catch (startFailure) {
    showStatus(errorMessage(startFailure, "The transcription could not be started."));
    setTranscribeDisabled(false);
    return;
  }

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

document.getElementById("transcribe").addEventListener("click", () => start());
document.getElementById("transcribe-compact").addEventListener("click", () => document.getElementById("transcribe").click());
document.getElementById("back-to-segments").addEventListener("click", () => returnToList());

renderResults();

await reattach();
await loadFixtureIfBackendUnreachable();
