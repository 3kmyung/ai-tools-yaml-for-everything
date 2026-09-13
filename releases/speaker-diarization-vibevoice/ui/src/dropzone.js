import { icon } from "./icons.js";

const IDLE_LABEL = "Drop an audio file, or click to browse";
const INPUT_ID = "audio-file";

function probeDuration(file, onDuration) {
  const probe = new Audio();
  const objectUrl = URL.createObjectURL(file);
  const release = () => URL.revokeObjectURL(objectUrl);

  probe.addEventListener("loadedmetadata", () => {
    onDuration(probe.duration);
    release();
  }, { once: true });
  probe.addEventListener("error", release, { once: true });

  probe.src = objectUrl;
}

export function createDropzone(element, handlers) {
  const input = Object.assign(document.createElement("input"), {
    type: "file",
    accept: "audio/*",
    id: INPUT_ID,
    className: "field-file-input",
  });
  const target = Object.assign(document.createElement("label"), { className: "dropzone-target", htmlFor: INPUT_ID });
  const label = Object.assign(document.createElement("span"), { className: "dropzone-label", textContent: IDLE_LABEL });

  const choose = (file) => {
    if (!file) return;

    label.textContent = file.name;

    handlers.onFile(file);
    probeDuration(file, handlers.onDuration);
  };

  target.append(icon("upload"), label);
  element.append(target, input);

  input.addEventListener("change", () => choose(input.files && input.files[0]));

  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    element.classList.add("is-dragover");
  });

  element.addEventListener("dragleave", (event) => {
    if (!element.contains(event.relatedTarget)) element.classList.remove("is-dragover");
  });

  element.addEventListener("drop", (event) => {
    event.preventDefault();
    element.classList.remove("is-dragover");

    choose(event.dataTransfer.files && event.dataTransfer.files[0]);
  });

  return {
    reset: () => {
      input.value = "";
      label.textContent = IDLE_LABEL;
    },
  };
}
