import { normalizeHex, toChannels, toHex } from "./hex.js";

const CHANNELS = [
  { name: "R", index: 0 },
  { name: "G", index: 1 },
  { name: "B", index: 2 },
];

const GAP = 8;
const REOPEN_GUARD_MS = 250;

let popover = null;
let previewSwatch = null;
let hexInput = null;
let suggestionSection = null;
let suggestionSwatches = null;
const sliders = [];
const readouts = [];

let currentHex = "#000000";
let currentAnchor = null;
let notifyChange = null;
let lastDismissedAnchor = null;
let lastDismissedAt = 0;

function buildChannelRow(channel) {
  const channelRow = document.createElement("label");
  channelRow.className = "color-picker-channel";

  const channelName = document.createElement("span");
  channelName.className = "color-picker-channel-name";
  channelName.textContent = channel.name;
  channelRow.appendChild(channelName);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "255";
  slider.step = "1";
  slider.className = "color-picker-slider";
  slider.addEventListener("input", () => {
    const channels = toChannels(currentHex);
    channels[channel.index] = Number(slider.value);
    apply(toHex(channels), { drivenBy: channel.index });
  });
  channelRow.appendChild(slider);

  const readout = document.createElement("span");
  readout.className = "color-picker-readout";
  channelRow.appendChild(readout);

  sliders[channel.index] = slider;
  readouts[channel.index] = readout;

  return channelRow;
}

function buildSuggestions() {
  suggestionSection = document.createElement("div");
  suggestionSection.className = "color-picker-suggestions";

  suggestionSwatches = document.createElement("div");
  suggestionSwatches.className = "color-picker-swatches";
  suggestionSwatches.setAttribute("role", "group");
  suggestionSwatches.setAttribute("aria-label", "From cover");
  suggestionSection.appendChild(suggestionSwatches);

  return suggestionSection;
}

function build() {
  popover = document.createElement("div");
  popover.className = "color-picker";
  popover.setAttribute("popover", "auto");
  popover.setAttribute("aria-label", "Color picker");

  const head = document.createElement("div");
  head.className = "color-picker-head";

  previewSwatch = document.createElement("div");
  previewSwatch.className = "color-picker-preview";
  head.appendChild(previewSwatch);

  const hexLine = document.createElement("div");
  hexLine.className = "color-picker-hex";

  hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.spellcheck = false;
  hexInput.autocomplete = "off";
  hexInput.setAttribute("aria-label", "Hex value");
  hexInput.addEventListener("input", () => {
    const normalized = normalizeHex(hexInput.value);
    if (normalized) apply(normalized, { drivenBy: "hex" });
  });
  hexInput.addEventListener("blur", () => {
    hexInput.value = currentHex;
  });
  hexLine.appendChild(hexInput);
  head.appendChild(hexLine);

  popover.appendChild(head);

  const channelRows = document.createElement("div");
  channelRows.className = "color-picker-channels";
  CHANNELS.forEach((channel) => channelRows.appendChild(buildChannelRow(channel)));
  popover.appendChild(channelRows);

  popover.appendChild(buildSuggestions());

  popover.addEventListener("toggle", (event) => {
    if (event.newState === "open") return;
    lastDismissedAnchor = currentAnchor;
    lastDismissedAt = Date.now();
    currentAnchor = null;
    notifyChange = null;
  });

  document.body.appendChild(popover);
}

function paintSwatches() {
  Array.from(suggestionSwatches.children).forEach((swatch) => {
    swatch.classList.toggle("is-selected", swatch.dataset.hex === currentHex);
  });
}

function paint(options) {
  const drivenBy = options && options.drivenBy !== undefined ? options.drivenBy : null;
  const channels = toChannels(currentHex);

  previewSwatch.style.setProperty("--swatch", currentHex);
  if (drivenBy !== "hex") hexInput.value = currentHex;

  CHANNELS.forEach((channel) => {
    const gradientStart = channels.slice();
    const gradientEnd = channels.slice();
    gradientStart[channel.index] = 0;
    gradientEnd[channel.index] = 255;

    const slider = sliders[channel.index];
    if (channel.index !== drivenBy) slider.value = String(channels[channel.index]);
    slider.style.setProperty("--from", toHex(gradientStart));
    slider.style.setProperty("--to", toHex(gradientEnd));
    readouts[channel.index].textContent = String(channels[channel.index]);
  });

  paintSwatches();
}

function apply(hex, options) {
  currentHex = hex;
  paint(options);
  if (notifyChange) notifyChange(currentHex);
}

function renderSuggestions(suggestions) {
  const uniqueHexes = [];
  (suggestions || []).forEach((hex) => {
    const normalized = normalizeHex(hex);
    if (normalized && uniqueHexes.indexOf(normalized) === -1) uniqueHexes.push(normalized);
  });

  suggestionSection.hidden = uniqueHexes.length === 0;
  suggestionSwatches.replaceChildren(
    ...uniqueHexes.map((hex) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "color-picker-swatch";
      swatch.setAttribute("aria-label", hex);
      swatch.dataset.hex = hex;
      swatch.title = hex;
      swatch.style.setProperty("--swatch", hex);
      swatch.addEventListener("click", () => apply(hex));
      return swatch;
    })
  );
}

function place(anchor) {
  const anchorBox = anchor.getBoundingClientRect();
  const pickerBox = popover.getBoundingClientRect();

  let top = anchorBox.bottom + GAP;
  if (top + pickerBox.height > window.innerHeight - GAP) {
    const above = anchorBox.top - GAP - pickerBox.height;
    top = above >= GAP ? above : Math.max(GAP, window.innerHeight - GAP - pickerBox.height);
  }

  const left = Math.min(
    Math.max(GAP, anchorBox.left),
    Math.max(GAP, window.innerWidth - GAP - pickerBox.width)
  );

  popover.style.left = left + "px";
  popover.style.top = top + "px";
}

export function openColorPicker(options) {
  if (!popover) build();

  const anchor = options.anchor;
  if (anchor === lastDismissedAnchor && Date.now() - lastDismissedAt < REOPEN_GUARD_MS) {
    lastDismissedAnchor = null;
    return;
  }

  if (popover.matches(":popover-open")) popover.hidePopover();

  currentAnchor = anchor;
  notifyChange = null;
  currentHex = normalizeHex(options.value) || "#000000";
  renderSuggestions(options.suggestions);
  paint();

  popover.showPopover();
  place(anchor);
  notifyChange = options.onInput;
}

export function closeColorPicker() {
  if (popover && popover.matches(":popover-open")) popover.hidePopover();
}
