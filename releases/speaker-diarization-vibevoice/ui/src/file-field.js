import { markFieldDefault } from "./fields.js";

const AUDIO_EXTENSIONS = /\.(wav|mp3|m4a|aac|flac|ogg|oga|opus|webm|wma|aif|aiff)$/i;
const DURATION_LIMIT = 3600;
const EMPTY_LABEL = "No file chosen";

function isAudio(file) {
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.test(file.name);
}

function measureDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (duration) => {
      URL.revokeObjectURL(url);
      resolve(duration);
    };

    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => finish(audio.duration));
    audio.addEventListener("error", () => finish(NaN));
    audio.src = url;
  });
}

function carriesFiles(event) {
  return Boolean(event.dataTransfer) && [...event.dataTransfer.types].includes("Files");
}

export function attachFileField(parts, onChange) {
  let current = null;
  let dragDepth = 0;

  function setWarning(message) {
    parts.warning.textContent = message;
    parts.warning.hidden = !message;
  }

  async function checkDuration(file) {
    const duration = await measureDuration(file);

    if (file !== current || !(duration > DURATION_LIMIT)) return;

    setWarning("This file runs past an hour, longer than the model reads in one pass.");
  }

  function choose(file) {
    if (!isAudio(file)) {
      setWarning(file.name + " is not an audio file.");
      return;
    }

    current = file;
    parts.name.textContent = file.name;
    setWarning("");
    markFieldDefault(parts.control, parts.revert, false);
    onChange(file);
    checkDuration(file);
  }

  function clear() {
    current = null;
    parts.input.value = "";
    parts.name.textContent = EMPTY_LABEL;
    setWarning("");
    markFieldDefault(parts.control, parts.revert, true);
    onChange(null);
  }

  function endDrag() {
    dragDepth = 0;
    parts.field.classList.remove("is-dropping");
  }

  parts.input.addEventListener("change", () => {
    if (parts.input.files.length) choose(parts.input.files[0]);
  });

  parts.revert.addEventListener("click", () => {
    clear();
    parts.input.focus();
  });

  document.addEventListener("dragenter", (event) => {
    if (!carriesFiles(event)) return;

    dragDepth += 1;
    parts.field.classList.add("is-dropping");
  });

  document.addEventListener("dragover", (event) => {
    if (carriesFiles(event)) event.preventDefault();
  });

  document.addEventListener("dragleave", (event) => {
    if (!carriesFiles(event)) return;

    dragDepth -= 1;

    if (dragDepth <= 0) endDrag();
  });

  document.addEventListener("drop", (event) => {
    if (!carriesFiles(event)) return;

    event.preventDefault();
    endDrag();

    if (event.dataTransfer.files.length) choose(event.dataTransfer.files[0]);
  });
}
