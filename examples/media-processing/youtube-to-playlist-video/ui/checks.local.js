import { contrast, escapeRegExp, requireTokenColor, stylesheetSource } from "./checks.js";

export const CHECKS = [
  {
    name: "#render-playlist rendered text meets 4.5:1 against its rendered fill",
    run: (frameDocument, frameWindow) => {
      const button = frameDocument.getElementById("render-playlist");

      if (!button) return "#render-playlist not found";

      const style = frameWindow.getComputedStyle(button);
      const ratio = contrast(style.color, style.backgroundColor);

      return ratio >= 4.5 ? true : `ratio ${ratio.toFixed(2)}`;
    },
  },
  {
    name: "#hint does not use --disabled",
    run: (frameDocument, frameWindow) => {
      const hint = frameDocument.getElementById("hint");
      const background = requireTokenColor(frameDocument, frameWindow, "--background");

      if (!hint) return "#hint not found";
      if (background.missing) return `${background.name} is not defined`;

      const ratio = contrast(frameWindow.getComputedStyle(hint).color, background.color);

      return ratio >= 4.5 ? true : `ratio ${ratio.toFixed(2)}`;
    },
  },
  {
    name: "components.css carries no domain nouns",
    run: async () => {
      const source = await stylesheetSource("./styles/components.css");
      const offenders = [ ...source.matchAll(/\.[\w-]*(?:track|playlist|render)[\w-]*/g) ].map((match) => match[0]);

      return offenders.length === 0 ? true : offenders.join(", ");
    },
  },
  {
    name: "the component vocabulary is present",
    run: async () => {
      const source = await stylesheetSource("./styles/components.css");
      const required = [
        ".action-primary", ".action-add", ".action-cancel", ".action-resume",
        ".caption-warning", ".status-message", ".item", ".item-label", ".item-remove",
      ];
      const missing = required.filter((name) => !new RegExp(`${escapeRegExp(name)}(?![\\w-])`).test(source));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
  {
    name: "field bodies are container queried",
    run: (frameDocument, frameWindow) => {
      const body = frameDocument.querySelector(".field-body");

      if (!body) return "no .field-body element is present";

      return frameWindow.getComputedStyle(body).containerType === "inline-size"
        ? true
        : "container-type not set";
    },
  },
];
