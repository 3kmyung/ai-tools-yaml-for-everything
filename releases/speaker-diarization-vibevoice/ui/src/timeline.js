import { createCategoryMarker } from "./category-marker.js";
import { compareSpeakers, speakerCategory, speakerName } from "./segments.js";

const PREVIOUS_KEYS = [ "ArrowLeft", "ArrowUp" ];
const NEXT_KEYS = [ "ArrowRight", "ArrowDown" ];

function createBlock(segment, index, onSelect) {
  const category = speakerCategory(segment.speakerId);
  const block = Object.assign(document.createElement("button"), {
    type: "button",
    className: "timeline-block",
    tabIndex: -1,
    title: segment.text,
  });

  block.dataset.index = String(index);
  block.style.setProperty("--start", String(segment.startTime));
  block.style.setProperty("--duration", String(segment.endTime - segment.startTime));
  block.setAttribute("aria-label", speakerName(segment.speakerId));
  block.addEventListener("click", () => onSelect(index));

  if (category) block.dataset.category = category;

  return block;
}

function createLegendEntry(speakerId) {
  const entry = Object.assign(document.createElement("li"), { className: "timeline-legend-entry" });
  const name = Object.assign(document.createElement("span"), { textContent: speakerName(speakerId) });

  entry.append(createCategoryMarker(speakerId), name);

  return entry;
}

function neighbourIndex(key, currentIndex, count) {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (PREVIOUS_KEYS.includes(key)) return Math.max(currentIndex - 1, 0);
  if (NEXT_KEYS.includes(key)) return Math.min(currentIndex + 1, count - 1);

  return null;
}

function moveFocus(event, blocks, onSelect) {
  const current = event.target.closest(".timeline-block");
  const nextIndex = current ? neighbourIndex(event.key, Number(current.dataset.index), blocks.length) : null;

  if (nextIndex === null) return;

  event.preventDefault();
  onSelect(nextIndex);

  blocks[nextIndex].focus({ preventScroll: true });
  blocks[nextIndex].scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function markSelectedTimelineBlock(scroller, selectedIndex) {
  const blocks = Array.from(scroller.querySelectorAll(".timeline-block"));
  const rovingIndex = selectedIndex !== null && blocks[selectedIndex] ? selectedIndex : 0;

  blocks.forEach((block, index) => {
    const selected = index === selectedIndex;

    block.classList.toggle("is-selected", selected);
    block.tabIndex = index === rovingIndex ? 0 : -1;

    if (selected) block.setAttribute("aria-current", "true");
    else block.removeAttribute("aria-current");
  });
}

export function renderTimeline(scroller, legend, segments, options) {
  const totalSeconds = segments.reduce((longest, segment) => Math.max(longest, segment.endTime), 0);
  const speakerIds = Array.from(new Set(segments.map((segment) => segment.speakerId))).sort(compareSpeakers);
  const blocks = segments.map((segment, index) => createBlock(segment, index, options.onSelect));
  const track = Object.assign(document.createElement("div"), { className: "timeline-track" });

  track.setAttribute("role", "group");
  track.setAttribute("aria-label", "Timeline");
  track.style.setProperty("--duration", String(totalSeconds));
  track.addEventListener("keydown", (event) => moveFocus(event, blocks, options.onSelect));
  track.append(...blocks);

  scroller.replaceChildren(track);
  legend.replaceChildren(...speakerIds.map((speakerId) => createLegendEntry(speakerId)));

  markSelectedTimelineBlock(scroller, options.selectedIndex);
}
