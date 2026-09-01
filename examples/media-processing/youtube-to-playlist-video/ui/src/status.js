function statusElement() {
  return document.getElementById("log");
}

function trailingGroup() {
  const trailing = document.createElement("div");
  trailing.className = "status-trailing";
  return trailing;
}

export async function withStatus(message, work, fallback) {
  const status = statusElement();
  showStatus(message);
  try {
    return await work();
  } catch (error) {
    showStatus(errorMessage(error, fallback));
    throw error;
  } finally {
    if (status.textContent === message) status.hidden = true;
  }
}

export function showStatus(message) {
  const status = statusElement();
  status.hidden = false;
  status.replaceChildren(Object.assign(document.createElement("span"), { textContent: message }));
}

export function showProgress(options) {
  const cancelling = options && options.cancelling !== undefined ? options.cancelling : false;
  const onCancel = options ? options.onCancel : null;

  const status = statusElement();
  status.hidden = false;

  const label = document.createElement("span");
  label.textContent = "Rendering…";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "cancel-render";

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

export function showInterrupt(state, options) {
  const resuming = options && options.resuming !== undefined ? options.resuming : false;
  const onResume = options ? options.onResume : null;
  const onCancel = options ? options.onCancel : null;

  const status = statusElement();
  status.hidden = false;

  const interruptMessage = state.interrupt ? state.interrupt.message : null;

  const label = document.createElement("span");
  label.textContent = interruptMessage != null ? interruptMessage : "Waiting before the next step…";

  const resume = document.createElement("button");
  resume.type = "button";
  resume.className = "resume-render";

  if (resuming) {
    resume.textContent = "Resuming…";
    resume.disabled = true;
  } else {
    resume.textContent = "Resume";
    resume.addEventListener("click", () => {
      if (onResume) onResume();
    });
  }

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "cancel-render";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    if (onCancel) onCancel();
  });

  const trailing = trailingGroup();
  trailing.append(resume, cancel);

  status.replaceChildren(label, trailing);
}

export function showResult(output) {
  const status = statusElement();
  status.hidden = false;

  const video = document.createElement("video");
  video.className = "status-video";
  video.controls = true;
  video.src = output.url;

  const link = document.createElement("a");
  link.href = output.url;
  link.download = output.path;
  link.textContent = output.path;

  const trailing = trailingGroup();
  trailing.append(link, video);

  status.replaceChildren(trailing);
}

export function errorMessage(error, fallback) {
  if (error instanceof TypeError) {
    return "Lost connection to the render server.";
  }
  return fallback;
}
