import { TRANSCRIPT_FORMATS, transcriptStem } from "./transcript-export.js";

let downloadUrls = [];

function logElement() {
  return document.getElementById("log");
}

function releaseDownloads() {
  downloadUrls.forEach((url) => URL.revokeObjectURL(url));

  downloadUrls = [];
}

function createMessage(message) {
  return Object.assign(document.createElement("span"), { className: "status-message", textContent: message });
}

function createAction(label, onClick) {
  const button = Object.assign(document.createElement("button"), {
    type: "button",
    className: "action-cancel",
    textContent: label,
  });

  if (onClick) button.addEventListener("click", () => onClick());

  return button;
}

function createDownload(format, segments, stem) {
  const blob = new Blob([format.build(segments)], { type: format.type });
  const url = URL.createObjectURL(blob);

  downloadUrls.push(url);

  return Object.assign(document.createElement("a"), {
    className: "action-add",
    href: url,
    download: stem + "." + format.extension,
    textContent: format.label,
  });
}

function createDownloads(transcript) {
  const segments = transcript ? transcript.segments : [];
  const stem = transcriptStem(transcript ? transcript.fileName : null);

  releaseDownloads();

  if (segments.length === 0) return [];

  return TRANSCRIPT_FORMATS.map((format) => createDownload(format, segments, stem));
}

function createTrailing(actions) {
  const trailing = Object.assign(document.createElement("div"), { className: "status-trailing" });

  trailing.append(...actions);

  return trailing;
}

export function showStatus(message) {
  const log = logElement();

  releaseDownloads();

  log.replaceChildren(createMessage(message));
  log.hidden = false;
}

export function hideStatus() {
  const log = logElement();

  releaseDownloads();

  log.replaceChildren();
  log.hidden = true;
}

export function showProgress(options) {
  const log = logElement();
  const cancelling = Boolean(options && options.cancelling);
  const onCancel = options ? options.onCancel : null;
  const cancel = createAction(cancelling ? "Cancelling…" : "Cancel", cancelling ? null : onCancel);

  cancel.disabled = cancelling;
  releaseDownloads();

  log.replaceChildren(createMessage("Transcribing…"), createTrailing([cancel]));
  log.hidden = false;
}

export function showFinished(message, onReset, transcript) {
  const log = logElement();
  const downloads = createDownloads(transcript);
  const reset = createAction("New file", onReset);

  log.replaceChildren(createMessage(message), createTrailing([...downloads, reset]));
  log.hidden = false;
}

export function errorMessage(error, fallback) {
  if (error instanceof TypeError) return "Lost connection to the transcription server.";

  return fallback;
}
