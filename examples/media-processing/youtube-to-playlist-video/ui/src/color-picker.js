import { normalizeHex, toChannels, toHex } from "./hex.js";
import { createReopenGuard, placePopover, trackPlacement } from "./popover.js";

const CHANNELS = [
  { name: "R", index: 0 },
  { name: "G", index: 1 },
  { name: "B", index: 2 },
];

const reopenGuard = createReopenGuard();

let popover = null;
let hexInput = null;
let suggestionSection = null;
let suggestionSwatches = null;
const sliders = [];
const readouts = [];

let currentHex = "#000000";
let currentAnchor = null;
let notifyChange = null;
let untrackPlacement = null;

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

  const channelRows = document.createElement("div");
  channelRows.className = "color-picker-channels";
  CHANNELS.forEach((channel) => channelRows.appendChild(buildChannelRow(channel)));
  popover.appendChild(channelRows);
  popover.appendChild(hexLine);

  popover.appendChild(buildSuggestions());

  popover.addEventListener("toggle", (event) => {
    if (event.newState === "open") return;
    if (untrackPlacement) untrackPlacement();
    untrackPlacement = null;
    reopenGuard.record(currentAnchor);
    currentAnchor = null;
    notifyChange = null;
  });

  document.body.appendChild(popover);
}

function paintSwatches() {
  suggestionSwatches.querySelectorAll(".color-picker-swatch").forEach((swatch) => {
    swatch.classList.toggle("is-selected", swatch.dataset.hex === currentHex);
  });
}

function paint(options) {
  const drivenBy = options && options.drivenBy !== undefined ? options.drivenBy : null;
  const channels = toChannels(currentHex);

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

      const frame = document.createElement("span");
      frame.className = "thumbnail-frame";
      frame.appendChild(swatch);
      return frame;
    })
  );
}

export function openColorPicker(options) {
  if (!popover) build();

  const anchor = options.anchor;
  if (reopenGuard.blocks(anchor)) {
    reopenGuard.clear();
    return;
  }

  if (popover.matches(":popover-open")) popover.hidePopover();

  currentAnchor = anchor;
  notifyChange = null;
  currentHex = normalizeHex(options.value) || "#000000";
  renderSuggestions(options.suggestions);
  paint();

  popover.showPopover();
  placePopover(anchor, popover);
  untrackPlacement = trackPlacement(anchor, popover);
  notifyChange = options.onInput;
}

export function closeColorPicker() {
  if (popover && popover.matches(":popover-open")) popover.hidePopover();
}
