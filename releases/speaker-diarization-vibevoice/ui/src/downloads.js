import { openMenu } from "./dropdown.js";
import { FORMATS } from "./formats.js";
import { createIcon } from "./icons.js";

let issuedUrls = [];

export function prepareDownloads(segments, stem) {
  const entries = FORMATS.map((format) => ({
    label: format.label,
    fileName: stem + "." + format.extension,
    href: URL.createObjectURL(new Blob([format.serialize(segments)], { type: format.type })),
  }));

  issuedUrls.forEach((url) => URL.revokeObjectURL(url));
  issuedUrls = entries.map((entry) => entry.href);

  return entries;
}

function createDownloadLink(entry) {
  const link = Object.assign(document.createElement("a"), {
    className: "dropdown-option",
    href: entry.href,
    download: entry.fileName,
  });
  const label = Object.assign(document.createElement("span"), { textContent: entry.label });

  link.setAttribute("role", "menuitem");
  link.appendChild(label);

  return link;
}

export function createDownloadControl(readEntries) {
  const anchor = Object.assign(document.createElement("button"), { className: "dropdown", type: "button" });
  const label = Object.assign(document.createElement("span"), { textContent: "Download" });
  const open = () => openMenu(anchor, readEntries().map(createDownloadLink));

  anchor.setAttribute("aria-haspopup", "menu");
  anchor.setAttribute("aria-expanded", "false");
  anchor.append(createIcon("download"), label, createIcon("chevron-down"));
  anchor.addEventListener("click", open);
  anchor.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    open();
  });

  return anchor;
}
