import { RATIO_SIZES } from "./ratios.js";

/*
 * Hosts a template in an iframe and keeps it fed with the current track.
 *
 * Reloading is the honest way to apply most changes: a template applies its
 * props once during init, and pretending otherwise would mean a second
 * implementation of every template's setup living here. Colors are the
 * exception — they are CSS custom properties, they are what a user drags
 * rather than types, and a reload on every drag frame would be unusable.
 */
/*
 * Identifies a cover the same way state.js's IDENTITY.cover does: by its
 * storage path, not by object reference. Task 16 builds the props object
 * fresh on every render pass, so two calls describing the same cover won't
 * be the same object — a raw !== would reload (and restart the animation)
 * on every unrelated state change. A plain string is treated as its own
 * identity so a caller that already resolved cover to a URL (as this
 * module's own JSDoc-documented `props.cover` has always allowed) still
 * compares correctly.
 */
function coverIdentity(cover) {
  if (cover == null) return null;
  if (typeof cover === "string") return cover;
  return cover.path ?? null;
}

export function createPreview(container) {
  let frame = null;
  let pending = null;
  let ready = false;
  let current = null;
  let destroyed = false;

  function onMessage(event) {
    if (event.source !== frame?.contentWindow) return;
    if (event.data?.type !== "preview-ready") return;
    ready = true;
    if (pending) {
      frame.contentWindow.postMessage({ type: "preview-props", props: pending }, "*");
      pending = null;
    }
  }

  window.addEventListener("message", onMessage);

  function reload(props) {
    ready = false;

    /*
     * The frame is told the *logical* size, not the chosen output resolution.
     * The template would otherwise scale itself up to 4K inside an iframe
     * that this host then scales back down — two transforms fighting for the
     * same result. The preview's job is to show the ratio's layout; pixel
     * count is the render's business.
     */
    const logical = RATIO_SIZES[props.ratio];
    pending = { ...props, width: logical.width, height: logical.height };

    if (frame) frame.remove();
    frame = document.createElement("iframe");
    frame.className = "preview-frame";
    frame.setAttribute("scrolling", "no");
    frame.src = `./render/animation-${props.style}.html`;
    container.replaceChildren(frame);

    // The frame is laid out at the logical stage size and scaled down to fit
    // the panel, so the preview is a true miniature rather than a reflow.
    frame.style.width = `${logical.width}px`;
    frame.style.height = `${logical.height}px`;
    const scale = Math.min(
      container.clientWidth / logical.width,
      container.clientHeight / logical.height
    );
    frame.style.transform = `scale(${scale})`;
  }

  function needsReload(next) {
    if (!current) return true;
    return (
      current.style !== next.style ||
      current.ratio !== next.ratio ||
      current.title !== next.title ||
      current.artist !== next.artist ||
      coverIdentity(current.cover) !== coverIdentity(next.cover)
    );
  }

  return {
    update(props) {
      if (destroyed) return;

      if (needsReload(props)) {
        reload(props);
      } else if (pending) {
        /*
         * A reload is already in flight (the new frame hasn't announced
         * preview-ready yet) — fold the new colors into the props that will
         * be sent once it does, rather than posting a preview-colors message
         * nobody is listening for yet and losing it.
         */
        pending = { ...pending, colors: props.colors };
      } else if (ready && frame) {
        frame.contentWindow.postMessage({ type: "preview-colors", colors: props.colors }, "*");
      }
      current = { ...props };
    },

    /*
     * Takes the frame down without retiring the instance — for when there is
     * nothing left to preview (the last track was deleted) rather than when
     * the host itself is going away. `current` is cleared too, so the next
     * update() is a first update() and reloads from scratch instead of
     * comparing against the props of a track that no longer exists.
     */
    clear() {
      if (destroyed) return;
      frame?.remove();
      frame = null;
      pending = null;
      ready = false;
      current = null;
      container.replaceChildren();
    },

    destroy() {
      destroyed = true;
      window.removeEventListener("message", onMessage);
      frame?.remove();
      frame = null;
      pending = null;
      ready = false;
    },
  };
}
