import { contrast, escapeRegExp, requireTokenColor, stylesheetSource } from "./checks.js";

function paintedRotatedAccent(frameDocument, frameWindow, angleDegrees) {
  const probe = frameDocument.createElement("span");
  probe.className = "category-swatch";
  probe.style.position = "fixed";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  probe.style.setProperty("--category-hue", angleDegrees + "deg");

  frameDocument.body.appendChild(probe);

  const probeStyle = frameWindow.getComputedStyle(probe);
  const baseColor = probeStyle.backgroundColor;
  const filterValue = probeStyle.filter;

  const canvas = frameDocument.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;

  const context = canvas.getContext("2d");
  context.filter = filterValue;
  context.fillStyle = baseColor;
  context.fillRect(0, 0, 1, 1);

  const [ red, green, blue ] = context.getImageData(0, 0, 1, 1).data;

  probe.remove();

  return `rgb(${red}, ${green}, ${blue})`;
}

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
  {
    name: "every speaker's hue-rotate angle clears 3:1 against --background and --background-panel",
    run: async (frameDocument, frameWindow) => {
      const { SPEAKER_HUES } = await import("./src/segments.js");

      const background = requireTokenColor(frameDocument, frameWindow, "--background");
      const backgroundPanel = requireTokenColor(frameDocument, frameWindow, "--background-panel");

      if (background.missing) return `${background.name} is not defined`;
      if (backgroundPanel.missing) return `${backgroundPanel.name} is not defined`;

      const failures = [];

      for (const angleDegrees of SPEAKER_HUES) {
        const painted = paintedRotatedAccent(frameDocument, frameWindow, angleDegrees);

        const onBackground = contrast(painted, background.color);
        const onBackgroundPanel = contrast(painted, backgroundPanel.color);

        if (onBackground < 3) failures.push(`${angleDegrees}deg on --background is ${onBackground.toFixed(2)}`);
        if (onBackgroundPanel < 3) failures.push(`${angleDegrees}deg on --background-panel is ${onBackgroundPanel.toFixed(2)}`);
      }

      return failures.length === 0 ? true : failures.join(" / ");
    },
  },
];
