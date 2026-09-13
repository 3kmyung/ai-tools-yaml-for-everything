import { createCategoryMarker } from "./category-marker.js";
import { formatRange, speakerName } from "./segments.js";

function createMetadata(segment) {
  const metadata = Object.assign(document.createElement("span"), { className: "item-meta" });
  const name = Object.assign(document.createElement("span"), { textContent: speakerName(segment.speakerId) });
  const range = Object.assign(document.createElement("span"), { textContent: formatRange(segment) });

  metadata.append(name, range);

  return metadata;
}

function createItem(segment, index, onSelect) {
  const item = Object.assign(document.createElement("li"), { className: "item" });
  const select = Object.assign(document.createElement("button"), { type: "button", className: "item-select" });
  const label = Object.assign(document.createElement("span"), { className: "item-label" });
  const text = Object.assign(document.createElement("span"), { className: "item-text", textContent: segment.text });

  item.dataset.item = "segment-" + index;
  label.append(createMetadata(segment), text);
  select.append(createCategoryMarker(segment.speakerId), label);
  select.addEventListener("click", () => onSelect(index));
  item.appendChild(select);

  return item;
}

export function markSelectedListItem(listElement, selectedIndex) {
  const items = Array.from(listElement.children);

  items.forEach((item, index) => {
    const selected = index === selectedIndex;
    const select = item.querySelector(".item-select");

    item.classList.toggle("is-selected", selected);

    if (selected) select.setAttribute("aria-current", "true");
    else select.removeAttribute("aria-current");
  });
}

export function renderSegmentList(listElement, segments, options) {
  const items = segments.map((segment, index) => createItem(segment, index, options.onSelect));

  listElement.replaceChildren(...items);

  markSelectedListItem(listElement, options.selectedIndex);
}
