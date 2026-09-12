import { icon } from "./icons.js";

const IDLE_LABEL = "Drop an audio file, or click to browse";

function probeDuration(file, onDuration) {
  const probe = new Audio();
  const objectUrl = URL.createObjectURL(file);

  probe.addEventListener("loadedmetadata", () => {
    onDuration(probe.duration);
    URL.revokeObjectURL(objectUrl);
  }, { once: true });

  probe.addEventListener("error", () => {
    URL.revokeObjectURL(objectUrl);
  }, { once: true });

  probe.src = objectUrl;
}

export function createDropzone(element, handlers) {
  const onFile = handlers.onFile;
  const onDuration = handlers.onDuration;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "audio/*";
  input.className = "field-file-input";

  const label = document.createElement("label");
  label.className = "dropzone-target";

  const uploadIcon = icon("upload");
  uploadIcon.classList.add("dropzone-icon");

  const text = document.createElement("span");
  text.className = "dropzone-label";
  text.textContent = IDLE_LABEL;

  label.append(uploadIcon, text, input);
  element.append(label);

  function choose(file) {
    if (!file) return;

    text.textContent = file.name;

    onFile(file);
    probeDuration(file, onDuration);
  }

  input.addEventListener("change", () => choose(input.files && input.files[0]));

  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    element.classList.add("is-dragover");
  });

  element.addEventListener("dragleave", () => {
    element.classList.remove("is-dragover");
  });

  element.addEventListener("drop", (event) => {
    event.preventDefault();
    element.classList.remove("is-dragover");

    choose(event.dataTransfer.files && event.dataTransfer.files[0]);
  });

  return {
    reset: () => {
      input.value = "";
      text.textContent = IDLE_LABEL;
    },
  };
}
