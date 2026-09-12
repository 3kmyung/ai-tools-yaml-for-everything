export const SPEAKER_HUES = [ 0, 70, 125, 170, 205, 249 ];

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

function renderSegmentMeta(segment) {
  const meta = document.createElement("span");
  meta.className = "item-meta";

  const speaker = document.createElement("span");
  speaker.className = "item-speaker";
  speaker.textContent = speakerName(segment.speakerId);

  const range = document.createElement("span");
  range.className = "item-range";
  range.textContent = formatTimestamp(segment.startTime) + "–" + formatTimestamp(segment.endTime);

  meta.append(speaker, range);

  return meta;
}

function renderSegmentText(segment) {
  const text = document.createElement("span");
  text.className = "item-text";
  text.textContent = segment.text;

  return text;
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
      label.append(renderSegmentMeta(segment), renderSegmentText(segment));

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
