const GAP = 8;
const REOPEN_GUARD_MILLISECONDS = 250;

export function placePopover(anchor, element) {
  const anchorBox = anchor.getBoundingClientRect();
  const elementBox = element.getBoundingClientRect();

  let top = anchorBox.bottom + GAP;
  if (top + elementBox.height > window.innerHeight - GAP) {
    const above = anchorBox.top - GAP - elementBox.height;
    top = above >= GAP ? above : Math.max(GAP, window.innerHeight - GAP - elementBox.height);
  }

  const left = Math.min(
    Math.max(GAP, anchorBox.left),
    Math.max(GAP, window.innerWidth - GAP - elementBox.width)
  );

  element.style.left = left + "px";
  element.style.top = top + "px";
}

export function trackPlacement(anchor, element) {
  const reposition = () => placePopover(anchor, element);

  window.addEventListener("resize", reposition);

  return () => window.removeEventListener("resize", reposition);
}

export function createReopenGuard() {
  let dismissedAnchor = null;
  let dismissedAt = 0;

  return {
    record: (anchor) => {
      dismissedAnchor = anchor;
      dismissedAt = Date.now();
    },

    blocks: (anchor) =>
      anchor === dismissedAnchor && Date.now() - dismissedAt < REOPEN_GUARD_MILLISECONDS,

    clear: () => {
      dismissedAnchor = null;
    },
  };
}
