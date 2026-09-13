import { createCategoryMarker } from "./category-marker.js";
import { formatRange, speakerName } from "./segments.js";

function createDetailContent(segment) {
  const metadata = Object.assign(document.createElement("p"), { className: "detail-meta" });
  const name = Object.assign(document.createElement("span"), { textContent: speakerName(segment.speakerId) });
  const range = Object.assign(document.createElement("span"), { textContent: formatRange(segment) });
  const text = Object.assign(document.createElement("p"), { className: "detail-text", textContent: segment.text });

  metadata.append(createCategoryMarker(segment.speakerId), name, range);

  return [ metadata, text ];
}

export function renderSegmentDetail(detailElement, segments, selectedIndex) {
  const segment = selectedIndex === null ? null : segments[selectedIndex] ?? null;
  const content = segment === null ? [] : createDetailContent(segment);

  detailElement.replaceChildren(...content);
  detailElement.hidden = segment === null;
}
