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
      item.className = track.id === selectedId ? "track is-selected" : "track";
      item.addEventListener("click", () => onSelect(track.id));

      const cover = effective(track.cover);
      const thumbnail = document.createElement(cover && cover.url ? "img" : "div");
      thumbnail.className = "thumbnail";
      if (cover && cover.url) {
        thumbnail.alt = "";
        thumbnail.src = cover.url;
      }
      item.appendChild(thumbnail);

      const label = document.createElement("span");
      label.className = "track-label";
      label.textContent = effective(track.title) || "Track " + (index + 1);
      item.appendChild(label);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-track";
      remove.setAttribute("aria-label", "Remove track");
      remove.appendChild(icon("remove"));
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        onRemove(track.id);
      });
      item.appendChild(remove);

      return item;
    })
  );
}
