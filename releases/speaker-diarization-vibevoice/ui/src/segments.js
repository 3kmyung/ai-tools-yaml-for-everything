export const SPEAKER_HUES = [ 0, 70, 125, 170, 205, 249 ];

const NON_SPEECH_TAG = /^\s*[\[(][^\])]*[\])]\s*$/;

export function segmentsFromResponse(response) {
  return response.map((segment) => ({
    text: segment.text ?? segment.Content,
    startTime: segment.start_time ?? segment.Start,
    endTime: segment.end_time ?? segment.End,
    speakerId: segment.speaker_id ?? segment.Speaker,
  }));
}

export function hasSpeaker(speakerId) {
  return Number.isInteger(speakerId);
}

export function isSpokenSegment(segment) {
  return !NON_SPEECH_TAG.test(segment.text || "");
}

export function firstSpokenIndex(segments) {
  const index = segments.findIndex(isSpokenSegment);

  return index === -1 ? (segments.length ? 0 : null) : index;
}

export function speakerHue(speakerId) {
  return hasSpeaker(speakerId) ? SPEAKER_HUES[speakerId % SPEAKER_HUES.length] : 0;
}

export function speakerName(speakerId) {
  return hasSpeaker(speakerId) ? "Speaker " + (speakerId + 1) : "Unattributed";
}

export function formatTimestamp(seconds) {
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return minutes + ":" + String(remainingSeconds).padStart(2, "0");
}

export function buildSwatch(speakerId) {
  const swatch = document.createElement("span");
  swatch.className = hasSpeaker(speakerId) ? "category-swatch" : "category-swatch is-unattributed";
  swatch.style.setProperty("--category-hue", speakerHue(speakerId) + "deg");
  swatch.setAttribute("aria-hidden", "true");

  return swatch;
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

      const swatch = buildSwatch(segment.speakerId);

      const label = document.createElement("span");
      label.className = "item-label";
      label.append(renderSegmentMeta(segment), renderSegmentText(segment));

      select.append(swatch, label);
      item.appendChild(select);

      return item;
    })
  );
}

export function renderSegmentDetail(detailElement, segments, selectedIndex) {
  const segment = selectedIndex === null ? null : segments[selectedIndex];

  detailElement.hidden = segment === undefined || segment === null;

  if (detailElement.hidden) {
    detailElement.replaceChildren();

    return;
  }

  const swatch = buildSwatch(segment.speakerId);

  const speaker = document.createElement("span");
  speaker.className = "item-speaker";
  speaker.textContent = speakerName(segment.speakerId);

  const range = document.createElement("span");
  range.className = "item-range";
  range.textContent = formatTimestamp(segment.startTime) + "–" + formatTimestamp(segment.endTime);

  const meta = document.createElement("p");
  meta.className = "detail-meta";
  meta.append(swatch, speaker, range);

  const text = document.createElement("p");
  text.className = "detail-text";
  text.textContent = segment.text;

  detailElement.replaceChildren(meta, text);
}

export function markSelectedListItem(listElement, selectedIndex) {
  Array.from(listElement.children).forEach((item, index) => {
    item.classList.toggle("is-selected", index === selectedIndex);
  });
}
