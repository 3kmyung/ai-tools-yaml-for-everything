import { effective } from "./state.js";
import { icon } from "./icons.js";

export function renderTrackList(tracks, options) {
  const selectedId = options.selectedId;
  const onSelect = options.onSelect;
  const onRemove = options.onRemove;

  const list = document.querySelector("#tracks ol");

  list.replaceChildren(
    ...tracks.map((track, index) => {
      const item = document.createElement("li");
      item.className = track.id === selectedId ? "item is-selected" : "item";
      item.dataset.item = track.id;

      const select = document.createElement("button");
      select.type = "button";
      select.className = "item-select";

      select.addEventListener("click", () => onSelect(track.id));

      const cover = effective(track.cover);

      const thumbnail = document.createElement(cover && cover.url ? "img" : "div");
      thumbnail.className = "thumbnail";

      if (cover && cover.url) {
        thumbnail.alt = "";
        thumbnail.src = cover.url;
      }

      const frame = document.createElement("span");
      frame.className = "thumbnail-frame";

      frame.appendChild(thumbnail);

      select.appendChild(frame);

      const label = document.createElement("span");
      label.className = "item-label";
      label.textContent = effective(track.title) || "Track " + (index + 1);

      select.appendChild(label);

      item.appendChild(select);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "item-remove";
      remove.setAttribute("aria-label", "Remove track");
      remove.appendChild(icon("remove"));

      remove.addEventListener("click", () => onRemove(track.id));

      item.appendChild(remove);

      return item;
    })
  );
}

export function markSelectedTrack(selectedId) {
  const list = document.querySelector("#tracks ol");

  Array.from(list.children).forEach((item) => {
    item.classList.toggle("is-selected", item.dataset.item === selectedId);
  });
}
