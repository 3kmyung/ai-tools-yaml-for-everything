import { speakerCategory } from "./segments.js";

export function createCategoryMarker(speakerId) {
  const category = speakerCategory(speakerId);
  const marker = Object.assign(document.createElement("span"), { className: "category-marker" });

  marker.setAttribute("aria-hidden", "true");

  if (category) marker.dataset.category = category;

  return marker;
}
