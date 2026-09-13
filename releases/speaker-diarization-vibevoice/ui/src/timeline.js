import { categoryFor, laneKey, speakerName } from "./segments.js";
import { clockLabel } from "./time.js";

const TICK_STEPS = [5, 10, 15, 30, 60, 120, 300, 600];
const TICK_TARGET = 8;
const TICK_READABLE_STEP = 30;

function tickStep(duration) {
  const fitting = TICK_STEPS.find((step) => duration / step <= TICK_TARGET || step >= TICK_READABLE_STEP);

  return fitting || TICK_STEPS[TICK_STEPS.length - 1];
}

function createTick(start, withHours) {
  const tick = Object.assign(document.createElement("span"), {
    className: "timeline-tick",
    textContent: clockLabel(start, withHours),
  });

  tick.style.setProperty("--start", String(start));

  return tick;
}

function createRuler(summary) {
  const ruler = Object.assign(document.createElement("div"), { className: "timeline-ruler" });
  const step = tickStep(summary.duration);
  const starts = [];

  ruler.setAttribute("aria-hidden", "true");

  for (let start = 0; start < summary.duration - step / 2; start += step) starts.push(start);

  ruler.replaceChildren(...starts.map((start) => createTick(start, summary.withHours)));

  return ruler;
}

function createHeader(lane, withHours) {
  const header = Object.assign(document.createElement("div"), { className: "timeline-lane-header" });
  const marker = Object.assign(document.createElement("span"), { className: "marker" });
  const label = Object.assign(document.createElement("span"), {
    className: "timeline-lane-label",
    textContent: lane.name,
  });
  const total = Object.assign(document.createElement("span"), {
    className: "timeline-lane-total",
    textContent: clockLabel(lane.total, withHours),
  });

  if (lane.category) marker.dataset.category = lane.category;

  header.append(marker, label, total);

  return header;
}

function createBlock(segment, index, withHours, onSelect) {
  const block = Object.assign(document.createElement("button"), {
    className: "timeline-block",
    type: "button",
    tabIndex: -1,
  });
  const range = clockLabel(segment.start_time, withHours) + " to " + clockLabel(segment.end_time, withHours);
  const category = categoryFor(segment);

  block.dataset.index = String(index);
  block.setAttribute("aria-label", speakerName(segment) + ", " + range);
  block.style.setProperty("--start", String(segment.start_time));
  block.style.setProperty("--length", String(Math.max(0, segment.end_time - segment.start_time)));

  if (category) block.dataset.category = category;

  block.addEventListener("click", () => onSelect(index));

  return block;
}

export function renderTimeline(parts, segments, summary, onSelect) {
  const tracks = new Map(summary.lanes.map((lane) => [lane.key, Object.assign(document.createElement("div"), { className: "timeline-track" })]));
  const blocks = segments.map((segment, index) => createBlock(segment, index, summary.withHours, onSelect));
  const spacer = Object.assign(document.createElement("div"), { className: "timeline-ruler-spacer" });

  blocks.forEach((block, index) => tracks.get(laneKey(segments[index])).appendChild(block));
  parts.canvas.style.setProperty("--duration", String(Math.max(summary.duration, 1)));
  parts.headers.replaceChildren(spacer, ...summary.lanes.map((lane) => createHeader(lane, summary.withHours)));
  parts.canvas.replaceChildren(createRuler(summary), ...tracks.values());

  return blocks;
}

export function markTimelineSelection(blocks, index) {
  blocks.forEach((block, position) => {
    const selected = position === index;

    block.tabIndex = selected ? 0 : -1;

    if (selected) block.setAttribute("aria-current", "true");
    else block.removeAttribute("aria-current");
  });
}
