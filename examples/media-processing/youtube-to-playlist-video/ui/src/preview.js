import { SCREEN_RATIOS } from "./ratios.js";
import { PREVIEW_MESSAGES } from "./preview-protocol.js";

function coverIdentity(cover) {
  if (cover == null) return null;
  if (typeof cover === "string") return cover;
  return cover.path != null ? cover.path : null;
}

export function createPreview(container) {
  let frame = null;
  let pending = null;
  let ready = false;
  let current = null;
  let destroyed = false;

  function onMessage(event) {
    const frameWindow = frame ? frame.contentWindow : null;
    if (event.source !== frameWindow) return;
    if (!event.data || event.data.type !== PREVIEW_MESSAGES.ready) return;
    ready = true;
    if (pending) {
      frame.contentWindow.postMessage({ type: PREVIEW_MESSAGES.properties, properties: pending }, "*");
      pending = null;
    }
  }

  window.addEventListener("message", onMessage);

  function reload(properties) {
    ready = false;

    const logical = SCREEN_RATIOS[properties.ratio];
    pending = Object.assign({}, properties, { width: logical.width, height: logical.height });

    if (frame) frame.remove();
    frame = document.createElement("iframe");
    frame.className = "preview-frame";
    frame.setAttribute("scrolling", "no");
    frame.src = "./templates/" + properties.style + ".html";

    const screenElement = document.createElement("div");
    screenElement.className = "preview-screen";
    screenElement.appendChild(frame);
    container.replaceChildren(screenElement);
  }

  function needsReload(next) {
    if (!current) return true;
    return (
      current.style !== next.style ||
      current.ratio !== next.ratio ||
      current.title !== next.title ||
      current.artist !== next.artist ||
      current.track_index !== next.track_index ||
      current.bandCount !== next.bandCount ||
      current.fps !== next.fps ||
      coverIdentity(current.cover) !== coverIdentity(next.cover)
    );
  }

  return {
    update: (properties) => {
      if (destroyed) return;

      if (needsReload(properties)) {
        reload(properties);
      } else if (pending) {
        pending = Object.assign({}, pending, { colors: properties.colors });
      } else if (ready && frame) {
        frame.contentWindow.postMessage({ type: PREVIEW_MESSAGES.colors, colors: properties.colors }, "*");
      }
      current = Object.assign({}, properties);
    },

    clear: () => {
      if (destroyed) return;
      if (frame) frame.remove();
      frame = null;
      pending = null;
      ready = false;
      current = null;
      container.replaceChildren();
    },

    destroy: () => {
      destroyed = true;
      window.removeEventListener("message", onMessage);
      if (frame) frame.remove();
      frame = null;
      pending = null;
      ready = false;
    },
  };
}
