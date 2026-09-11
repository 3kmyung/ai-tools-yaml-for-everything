import { contrast, escapeRegExp, requireTokenColor, stylesheetSource } from "./checks.js";

export const CHECKS = [
  {
    name: "#transcribe rendered text meets 4.5:1 against its rendered fill",
    run: (frameDocument, frameWindow) => {
      const button = frameDocument.getElementById("transcribe");

      if (!button) return "#transcribe not found";

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
      const offenders = [ ...source.matchAll(/\.[\w-]*(?:speaker|transcript|meeting)[\w-]*/g) ].map((match) => match[0]);

      return offenders.length === 0 ? true : offenders.join(", ");
    },
  },
  {
    name: "the component vocabulary is present",
    run: async () => {
      const source = await stylesheetSource("./styles/components.css");
      const required = [
        ".action-primary", ".action-cancel",
        ".caption-warning", ".status-message", ".item", ".item-label",
      ];
      const missing = required.filter((name) => !new RegExp(`${escapeRegExp(name)}(?![\\w-])`).test(source));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
];
