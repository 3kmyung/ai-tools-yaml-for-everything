function logElement() {
  return document.getElementById("log");
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

function createTrailing(action) {
  const trailing = Object.assign(document.createElement("div"), { className: "status-trailing" });

  trailing.append(action);

  return trailing;
}

export function showStatus(message) {
  const log = logElement();

  log.replaceChildren(createMessage(message));
  log.hidden = false;
}

export function hideStatus() {
  const log = logElement();

  log.replaceChildren();
  log.hidden = true;
}

export function showProgress(options) {
  const log = logElement();
  const cancelling = Boolean(options && options.cancelling);
  const onCancel = options ? options.onCancel : null;
  const cancel = createAction(cancelling ? "Cancelling…" : "Cancel", cancelling ? null : onCancel);

  cancel.disabled = cancelling;

  log.replaceChildren(createMessage("Transcribing…"), createTrailing(cancel));
  log.hidden = false;
}

export function showFinished(message, onReset) {
  const log = logElement();
  const reset = createAction("New file", onReset);

  log.replaceChildren(createMessage(message), createTrailing(reset));
  log.hidden = false;
}

export function errorMessage(error, fallback) {
  if (error instanceof TypeError) return "Lost connection to the transcription server.";

  return fallback;
}
