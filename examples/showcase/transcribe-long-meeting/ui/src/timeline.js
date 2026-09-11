import { speakerHue, speakerName } from "./segments.js";

const PIXELS_PER_SECOND = 36;
const MINIMUM_SEGMENT_WIDTH = 6;

function buildTrack(segments, selectedIndex, onSelect) {
  const totalSeconds = segments.reduce((longest, segment) => Math.max(longest, segment.endTime), 0);

  const track = document.createElement("div");
  track.className = "timeline-track";
  track.style.width = Math.max(totalSeconds * PIXELS_PER_SECOND, 1) + "px";

  segments.forEach((segment, index) => {
    const left = segment.startTime * PIXELS_PER_SECOND;
    const width = Math.max((segment.endTime - segment.startTime) * PIXELS_PER_SECOND, MINIMUM_SEGMENT_WIDTH);

    const block = document.createElement("button");
    block.type = "button";
    block.className = index === selectedIndex ? "timeline-segment is-selected" : "timeline-segment";
    block.style.left = left + "px";
    block.style.width = width + "px";
    block.style.setProperty("--category-hue", speakerHue(segment.speakerId) + "deg");
    block.title = speakerName(segment.speakerId) + " — " + segment.text;

    block.addEventListener("click", () => onSelect(index));

    track.appendChild(block);
  });

  return track;
}

function buildLegend(segments) {
  const legend = document.createElement("ol");
  legend.className = "timeline-legend";

  const speakerIds = Array.from(new Set(segments.map((segment) => segment.speakerId))).sort((first, second) => first - second);

  legend.append(
    ...speakerIds.map((speakerId) => {
      const entry = document.createElement("li");
      entry.className = "timeline-legend-entry";

      const swatch = document.createElement("span");
      swatch.className = "category-swatch";
      swatch.style.setProperty("--category-hue", speakerHue(speakerId) + "deg");
      swatch.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.textContent = speakerName(speakerId);

      entry.append(swatch, label);

      return entry;
    })
  );

  return legend;
}

export function renderTimeline(element, segments, options) {
  const onSelect = options.onSelect;
  const selectedIndex = options.selectedIndex;

  const scroller = document.createElement("div");
  scroller.className = "timeline-scroller";
  scroller.appendChild(buildTrack(segments, selectedIndex, onSelect));

  element.replaceChildren(scroller, buildLegend(segments));
}

export function markSelectedTimelineBlock(element, selectedIndex) {
  const blocks = element.querySelectorAll(".timeline-segment");

  blocks.forEach((block, index) => {
    block.classList.toggle("is-selected", index === selectedIndex);
  });
}
