function statusElement() {
  return document.getElementById("log");
}

function trailingGroup() {
  const trailing = document.createElement("div");
  trailing.className = "status-trailing";

  return trailing;
}

export function showStatus(message) {
  const status = statusElement();
  status.hidden = false;

  status.replaceChildren(Object.assign(document.createElement("span"), {
    className: "status-message",
    textContent: message,
  }));
}

export function hideStatus() {
  const status = statusElement();
  status.hidden = true;

  status.replaceChildren();
}

export function showProgress(options) {
  const cancelling = options && options.cancelling !== undefined ? options.cancelling : false;
  const onCancel = options ? options.onCancel : null;

  const status = statusElement();
  status.hidden = false;

  const label = document.createElement("span");
  label.className = "status-message";
  label.textContent = "Transcribing…";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "action-cancel";

  if (cancelling) {
    cancel.textContent = "Cancelling…";
    cancel.disabled = true;
  } else {
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      if (onCancel) onCancel();
    });
  }

  const trailing = trailingGroup();
  trailing.append(cancel);

  status.replaceChildren(label, trailing);
}

export function showFinished(message, onReset) {
  const status = statusElement();
  status.hidden = false;

  const label = document.createElement("span");
  label.className = "status-message";
  label.textContent = message;

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "action-cancel";
  reset.textContent = "New file";
  reset.addEventListener("click", onReset);

  const trailing = trailingGroup();
  trailing.append(reset);

  status.replaceChildren(label, trailing);
}

export function errorMessage(error, fallback) {
  if (error instanceof TypeError) {
    return "Lost connection to the transcription server.";
  }

  return fallback;
}
