import { createApi } from "./api.js";
import { createDownloadControl, prepareDownloads } from "./downloads.js";
import { attachTextField } from "./fields.js";
import { attachFileField } from "./file-field.js";
import { EXAMPLE_NAME, fileStem } from "./formats.js";
import { readHotwords } from "./hotwords.js";
import { hydrateIcons } from "./icons.js";
import { markListSelection, renderSegmentList } from "./segment-list.js";
import { readSegments, summarizeSegments } from "./segments.js";
import { createElapsedClock, showStatus } from "./status.js";
import { listenForSteps } from "./stepping.js";
import { markTimelineSelection, renderTimeline } from "./timeline.js";
import { clockLabel } from "./time.js";

const elements = {
  audioField: document.getElementById("audio-field"),
  audioInput: document.getElementById("audio-file"),
  audioControl: document.getElementById("audio-control"),
  audioName: document.getElementById("audio-name"),
  audioRevert: document.getElementById("audio-revert"),
  warning: document.getElementById("warning"),
  hotwords: document.getElementById("hotwords"),
  hotwordsControl: document.getElementById("hotwords-control"),
  hotwordsRevert: document.getElementById("hotwords-revert"),
  transcribe: document.getElementById("transcribe"),
  sourceName: document.getElementById("source-name"),
  figures: document.getElementById("figures"),
  hint: document.getElementById("hint"),
  timeline: document.getElementById("timeline"),
  timelineHeaders: document.getElementById("timeline-headers"),
  timelineCanvas: document.getElementById("timeline-canvas"),
  segments: document.getElementById("segments"),
  log: document.getElementById("log"),
};

const HINTS = {
  sample: "This is sample output. Choose or drop an audio file of up to an hour to transcribe your own.",
  result: "Select a block or a row to read its segment. Arrow keys step between segments.",
};

const PROGRESS_MESSAGES = {
  pending: "Waiting for the model",
  queued: "Waiting for the model",
};

const api = createApi(new URLSearchParams(window.location.search).get("api"));

const view = {
  blocks: [],
  items: [],
  downloads: [],
  file: null,
  task: null,
};

function plural(count, noun) {
  return count + " " + noun + (count === 1 ? "" : "s");
}

function select(index, origin) {
  const block = view.blocks[index];
  const item = view.items[index];

  if (!block || !item) return;

  markTimelineSelection(view.blocks, index);
  markListSelection(view.items, index);
  block.scrollIntoView({ block: "nearest", inline: "nearest" });
  item.scrollIntoView({ block: "nearest", inline: "nearest" });

  if (origin === "timeline") block.focus({ preventScroll: true });
  if (origin === "list") item.firstElementChild.focus({ preventScroll: true });
}

function renderFigures(summary, count) {
  const texts = [
    plural(summary.speakerCount, "speaker"),
    plural(count, "segment"),
    clockLabel(summary.duration, summary.withHours),
  ];

  elements.figures.replaceChildren(...texts.map((text) => Object.assign(document.createElement("li"), { textContent: text })));
}

function showResult(segments, sourceFile) {
  const summary = summarizeSegments(segments);
  const stem = sourceFile ? fileStem(sourceFile.name) : EXAMPLE_NAME;
  const onSelect = (index) => select(index, null);

  view.blocks = renderTimeline({ headers: elements.timelineHeaders, canvas: elements.timelineCanvas }, segments, summary, onSelect);
  view.items = renderSegmentList(elements.segments, segments, summary.withHours, onSelect);
  view.downloads = prepareDownloads(segments, stem);
  elements.sourceName.textContent = sourceFile ? sourceFile.name : "Sample recording";
  elements.hint.textContent = sourceFile ? HINTS.result : HINTS.sample;
  renderFigures(summary, segments.length);
  elements.segments.scrollTop = 0;
  elements.timeline.scrollLeft = 0;

  select(0, null);
}

function showSettled(message) {
  const download = createDownloadControl(() => view.downloads);

  showStatus(elements.log, message, [download]);
}

function refreshAction() {
  elements.transcribe.disabled = !view.file || Boolean(view.task);
}

function errorText(error) {
  if (!error) return "";
  if (typeof error === "string") return error;

  return error.message || error.detail || String(error);
}

function reportProgress(task, state) {
  const status = String(state.status).toLowerCase();
  const message = PROGRESS_MESSAGES[status] || "Transcribing";

  if (task.cancelling || message === task.message) return;

  task.message = message;
  showStatus(elements.log, message, [task.clock.element, task.cancel]);
}

function finish(state, file) {
  const status = String(state.status).toLowerCase();

  if (status === "cancelled") {
    showSettled("Transcription cancelled");
    return;
  }

  if (status !== "completed") {
    showSettled(errorText(state.error) || "Transcription failed");
    return;
  }

  showResult(readSegments(state.output), file);
  showSettled("Transcription finished");
}

async function cancelRunning() {
  const task = view.task;

  if (!task || !task.id) return;

  task.cancelling = true;
  task.cancel.textContent = "Cancelling…";
  task.cancel.disabled = true;

  try {
    await api.cancelTask(task.id);
  } catch (cancelFailure) {
    task.cancelling = false;
    task.cancel.textContent = "Cancel";
    task.cancel.disabled = false;
    task.message = cancelFailure.message;
    showStatus(elements.log, cancelFailure.message, [task.clock.element, task.cancel]);
  }
}

async function transcribe() {
  const file = view.file;
  const hotwords = readHotwords(elements.hotwords);
  const cancel = Object.assign(document.createElement("button"), {
    className: "action-cancel",
    type: "button",
    textContent: "Cancel",
    disabled: true,
  });
  const task = { id: null, cancel: cancel, clock: createElapsedClock(), cancelling: false, message: "Uploading audio" };

  view.task = task;
  refreshAction();
  cancel.addEventListener("click", cancelRunning);
  showStatus(elements.log, task.message, [task.clock.element, cancel]);

  try {
    const started = await api.startTranscription(file, hotwords);

    task.id = started.task_id;
    cancel.disabled = task.cancelling;
    reportProgress(task, { status: "processing" });

    const final = await api.watchTask(started.task_id, (state) => reportProgress(task, state));

    finish(final, file);
  } catch (failure) {
    showSettled(failure.message || "Transcription failed");
  } finally {
    task.clock.stop();
    view.task = null;
    refreshAction();
  }
}

async function loadSample() {
  try {
    const response = await fetch("./fixture.json");
    const fixture = await response.json();

    showResult(readSegments(fixture), null);
    showSettled("Showing sample output");
  } catch (loadFailure) {
    showResult([], null);
    showSettled("The sample output could not be loaded");
  }
}

hydrateIcons(document);

attachTextField({
  input: elements.hotwords,
  control: elements.hotwordsControl,
  revert: elements.hotwordsRevert,
});

attachFileField(
  {
    field: elements.audioField,
    input: elements.audioInput,
    control: elements.audioControl,
    name: elements.audioName,
    revert: elements.audioRevert,
    warning: elements.warning,
  },
  (file) => {
    view.file = file;
    refreshAction();
  },
);

listenForSteps(elements.timeline, ".timeline-block", (index) => select(index, "timeline"));
listenForSteps(elements.segments, ".item-select", (index) => select(index, "list"));
elements.transcribe.addEventListener("click", () => {
  if (view.file && !view.task) transcribe();
});

loadSample();
