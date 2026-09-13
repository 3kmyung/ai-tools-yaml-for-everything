const PREVIOUS_KEYS = ["ArrowLeft", "ArrowUp"];
const NEXT_KEYS = ["ArrowRight", "ArrowDown"];

export function steppedIndex(key, index, count) {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (PREVIOUS_KEYS.includes(key)) return Math.max(0, index - 1);
  if (NEXT_KEYS.includes(key)) return Math.min(count - 1, index + 1);

  return null;
}

export function listenForSteps(container, selector, onStep) {
  container.addEventListener("keydown", (event) => {
    const target = event.target.closest(selector);
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    const count = container.querySelectorAll(selector).length;
    const next = target && !modified ? steppedIndex(event.key, Number(target.dataset.index), count) : null;

    if (next === null) return;

    event.preventDefault();
    onStep(next);
  });
}
