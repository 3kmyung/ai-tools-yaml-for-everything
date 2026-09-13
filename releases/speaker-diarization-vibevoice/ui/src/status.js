import { closeMenu } from "./dropdown.js";
import { clockLabel } from "./time.js";

export function showStatus(log, message, trailing) {
  const text = Object.assign(document.createElement("span"), {
    className: "status-message",
    textContent: message,
    title: message,
  });
  const group = Object.assign(document.createElement("div"), { className: "status-trailing" });

  closeMenu();
  group.append(...trailing);
  log.replaceChildren(text, group);
}

export function createElapsedClock() {
  const startedAt = Date.now();
  const element = Object.assign(document.createElement("span"), {
    className: "status-time",
    textContent: clockLabel(0, false),
  });
  const timer = window.setInterval(() => {
    element.textContent = clockLabel((Date.now() - startedAt) / 1000, false);
  }, 1000);

  element.setAttribute("aria-hidden", "true");

  return {
    element: element,
    stop: () => window.clearInterval(timer),
  };
}
