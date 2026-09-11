export const SPEAKER_HUES = [ 0, 55, 145, 200, 235, 350 ];

export function segmentsFromResponse(response) {
  return response.map((segment) => ({
    text: segment.text ?? segment.Content,
    startTime: segment.start_time ?? segment.Start,
    endTime: segment.end_time ?? segment.End,
    speakerId: segment.speaker_id ?? segment.Speaker,
  }));
}

export function speakerHue(speakerId) {
  return SPEAKER_HUES[speakerId % SPEAKER_HUES.length];
}

export function speakerName(speakerId) {
  return "Speaker " + (speakerId + 1);
}

export function formatTimestamp(seconds) {
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return minutes + ":" + String(remainingSeconds).padStart(2, "0");
}

function renderSegmentLabel(segment) {
  return speakerName(segment.speakerId) + " · " +
    formatTimestamp(segment.startTime) + "–" + formatTimestamp(segment.endTime) +
    " — " + segment.text;
}

export function renderSegmentList(listElement, segments, options) {
  const onSelect = options.onSelect;
  const selectedIndex = options.selectedIndex;

  listElement.replaceChildren(
    ...segments.map((segment, index) => {
      const item = document.createElement("li");
      item.className = index === selectedIndex ? "item is-selected" : "item";
      item.dataset.item = "segment-" + index;

      const select = document.createElement("button");
      select.type = "button";
      select.className = "item-select";

      select.addEventListener("click", () => onSelect(index));

      const swatch = document.createElement("span");
      swatch.className = "category-swatch";
      swatch.style.setProperty("--category-hue", speakerHue(segment.speakerId) + "deg");
      swatch.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "item-label";
      label.textContent = renderSegmentLabel(segment);

      select.append(swatch, label);
      item.appendChild(select);

      return item;
    })
  );
}

export function markSelectedListItem(listElement, selectedIndex) {
  Array.from(listElement.children).forEach((item, index) => {
    item.classList.toggle("is-selected", index === selectedIndex);
  });
}
