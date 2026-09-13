import { categoryFor, speakerName } from "./segments.js";
import { clockLabel } from "./time.js";

function createRow(segment, index, withHours, onSelect) {
  const item = Object.assign(document.createElement("li"), { className: "item" });
  const button = Object.assign(document.createElement("button"), {
    className: "item-select",
    type: "button",
    tabIndex: -1,
  });
  const meta = Object.assign(document.createElement("span"), { className: "item-meta" });
  const marker = Object.assign(document.createElement("span"), { className: "marker" });
  const label = Object.assign(document.createElement("span"), {
    className: "item-label",
    textContent: speakerName(segment),
  });
  const time = Object.assign(document.createElement("span"), {
    className: "item-time",
    textContent: clockLabel(segment.start_time, withHours) + "–" + clockLabel(segment.end_time, withHours),
  });
  const text = Object.assign(document.createElement("span"), {
    className: "item-text",
    textContent: segment.text,
  });
  const category = categoryFor(segment);

  item.dataset.item = String(index);
  button.dataset.index = String(index);

  if (category) marker.dataset.category = category;

  meta.append(marker, label, time);
  button.append(meta, text);
  item.appendChild(button);
  button.addEventListener("click", () => onSelect(index));

  return item;
}

export function renderSegmentList(list, segments, withHours, onSelect) {
  const items = segments.map((segment, index) => createRow(segment, index, withHours, onSelect));

  list.replaceChildren(...items);

  return items;
}

export function markListSelection(items, index) {
  items.forEach((item, position) => {
    const selected = position === index;
    const button = item.firstElementChild;

    item.classList.toggle("is-selected", selected);
    button.tabIndex = selected ? 0 : -1;

    if (selected) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
}
