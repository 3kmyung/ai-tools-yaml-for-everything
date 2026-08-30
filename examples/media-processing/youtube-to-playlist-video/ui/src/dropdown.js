import { icon } from "./icons.js";

const GAP = 8;
const REOPEN_GUARD_MILLISECONDS = 250;

const configurations = new WeakMap();

let element = null;
let currentAnchor = null;
let lastDismissedAnchor = null;
let lastDismissedAt = 0;

function focusStep(menu, step) {
  const options = Array.from(menu.children);
  const index = options.indexOf(document.activeElement);
  const next = options[(index + step + options.length) % options.length];
  if (next) next.focus();
}

function retire(menu) {
  if (getComputedStyle(menu).display === "none") {
    menu.remove();
    return;
  }

  const running = menu.getAnimations();
  if (!running.length) {
    menu.remove();
    return;
  }

  Promise.allSettled(running.map((animation) => animation.finished)).then(() => menu.remove());
}

function build(anchor) {
  const menu = document.createElement("div");
  menu.className = "dropdown-menu";
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "listbox");

  menu.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusStep(menu, event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const edge = event.key === "Home" ? menu.firstElementChild : menu.lastElementChild;
      if (edge) edge.focus();
    }
  });

  menu.addEventListener("toggle", (event) => {
    if (event.newState === "open") return;

    anchor.setAttribute("aria-expanded", "false");
    lastDismissedAnchor = anchor;
    lastDismissedAt = Date.now();

    if (menu === element) {
      element = null;
      currentAnchor = null;
    }

    retire(menu);
  });

  document.body.appendChild(menu);

  return menu;
}

function paint(anchor, value) {
  const configuration = configurations.get(anchor);
  configuration.value = value;
  anchor.value = String(value);
  anchor.dataset.value = String(value);
  configuration.label.textContent = String(value);
}

function choose(anchor, menu, value) {
  const changed = String(configurations.get(anchor).value) !== String(value);

  menu.hidePopover();
  anchor.focus();

  if (!changed) return;
  paint(anchor, value);
  anchor.dispatchEvent(new Event("change"));
}

function renderOptions(anchor, menu) {
  const configuration = configurations.get(anchor);

  menu.replaceChildren(
    ...configuration.values.map((value) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "dropdown-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(String(value) === String(configuration.value)));
      option.tabIndex = -1;

      const label = document.createElement("span");
      label.textContent = String(value);
      option.appendChild(label);
      option.appendChild(icon("check"));

      option.addEventListener("click", () => choose(anchor, menu, value));

      return option;
    })
  );
}

function place(anchor, menu) {
  const anchorBox = anchor.getBoundingClientRect();
  const menuBox = menu.getBoundingClientRect();

  let top = anchorBox.bottom + GAP;
  if (top + menuBox.height > window.innerHeight - GAP) {
    const above = anchorBox.top - GAP - menuBox.height;
    top = above >= GAP ? above : Math.max(GAP, window.innerHeight - GAP - menuBox.height);
  }

  const left = Math.min(
    Math.max(GAP, anchorBox.left),
    Math.max(GAP, window.innerWidth - GAP - menuBox.width)
  );

  menu.style.left = left + "px";
  menu.style.top = top + "px";
}

function dismiss() {
  if (!element) return;

  const menu = element;
  element = null;
  currentAnchor = null;

  if (menu.matches(":popover-open")) menu.hidePopover();
}

function open(anchor) {
  const toggledOff =
    anchor === currentAnchor ||
    (anchor === lastDismissedAnchor && Date.now() - lastDismissedAt < REOPEN_GUARD_MILLISECONDS);

  lastDismissedAnchor = null;
  dismiss();
  if (toggledOff) return;

  const menu = build(anchor);
  element = menu;
  currentAnchor = anchor;

  renderOptions(anchor, menu);
  anchor.setAttribute("aria-expanded", "true");

  menu.style.minWidth = anchor.getBoundingClientRect().width + "px";
  menu.showPopover();
  place(anchor, menu);

  const selected = menu.querySelector("[aria-selected='true']") || menu.firstElementChild;
  if (selected) selected.focus();
}

export function setDropdown(anchor, values, value) {
  const known = configurations.has(anchor);
  const label = known ? configurations.get(anchor).label : document.createElement("span");

  configurations.set(anchor, { values: values, value: value, label: label });

  if (!known) {
    anchor.replaceChildren(label, icon("chevron"));
    anchor.setAttribute("aria-haspopup", "listbox");
    anchor.setAttribute("aria-expanded", "false");
    anchor.addEventListener("click", () => open(anchor));
  }

  paint(anchor, value);
}
