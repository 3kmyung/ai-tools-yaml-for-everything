const REOPEN_WINDOW = 250;
const ITEM_SELECTOR = '[role="menuitem"]';

function createReopenGuard() {
  let dismissedAnchor = null;
  let dismissedAt = 0;

  return {
    record: (anchor) => {
      dismissedAnchor = anchor;
      dismissedAt = Date.now();
    },
    blocks: (anchor) => anchor === dismissedAnchor && Date.now() - dismissedAt < REOPEN_WINDOW,
    clear: () => {
      dismissedAnchor = null;
    },
  };
}

const reopenGuard = createReopenGuard();

let activeMenu = null;
let activeAnchor = null;

function clamp(value, limit) {
  return Math.min(Math.max(0, value), Math.max(0, limit));
}

function placeMenu() {
  const anchorBox = activeAnchor.getBoundingClientRect();
  const menuBox = activeMenu.getBoundingClientRect();
  const fitsBelow = anchorBox.bottom + menuBox.height <= window.innerHeight;
  const top = fitsBelow ? anchorBox.bottom : anchorBox.top - menuBox.height;
  const left = anchorBox.right - menuBox.width;

  activeMenu.dataset.placement = fitsBelow ? "below" : "above";
  activeMenu.style.setProperty("--menu-top", clamp(top, window.innerHeight - menuBox.height) + "px");
  activeMenu.style.setProperty("--menu-left", clamp(left, window.innerWidth - menuBox.width) + "px");
}

function teardown() {
  const menu = activeMenu;
  const anchor = activeAnchor;
  const focusInside = menu.contains(document.activeElement) || document.activeElement === document.body;

  activeMenu = null;
  activeAnchor = null;
  window.removeEventListener("resize", placeMenu);
  anchor.setAttribute("aria-expanded", "false");
  menu.remove();

  if (focusInside && anchor.isConnected) anchor.focus();
}

function onBeforeToggle(event) {
  if (event.newState !== "closed" || event.target !== activeMenu) return;

  reopenGuard.record(activeAnchor);
}

function onToggle(event) {
  if (event.newState !== "closed" || event.target !== activeMenu) return;

  teardown();
}

function onMenuKeydown(event) {
  const items = [...activeMenu.querySelectorAll(ITEM_SELECTOR)];
  const index = items.indexOf(document.activeElement);
  const targets = {
    ArrowDown: Math.min(items.length - 1, index + 1),
    ArrowUp: Math.max(0, index - 1),
    Home: 0,
    End: items.length - 1,
  };

  if (event.key === "Tab") {
    event.preventDefault();
    closeMenu();
    return;
  }

  if (!(event.key in targets)) return;

  event.preventDefault();
  items[targets[event.key]].focus();
}

function onMenuClick(event) {
  if (!event.target.closest(ITEM_SELECTOR)) return;

  window.setTimeout(closeMenu, 0);
}

export function closeMenu() {
  if (!activeMenu) return;

  teardown();
}

export function openMenu(anchor, items) {
  if (reopenGuard.blocks(anchor)) {
    reopenGuard.clear();
    return;
  }

  const menu = Object.assign(document.createElement("div"), { className: "dropdown-menu" });

  closeMenu();
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "menu");
  menu.append(...items);
  menu.addEventListener("beforetoggle", onBeforeToggle);
  menu.addEventListener("toggle", onToggle);
  menu.addEventListener("keydown", onMenuKeydown);
  menu.addEventListener("click", onMenuClick);
  document.body.appendChild(menu);
  activeMenu = menu;
  activeAnchor = anchor;
  menu.showPopover();
  anchor.setAttribute("aria-expanded", "true");
  placeMenu();
  window.addEventListener("resize", placeMenu);

  if (items.length) items[0].focus();
}
