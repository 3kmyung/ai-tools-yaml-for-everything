const missingTokenSentinel = "rgb(1, 2, 3)";

function channel(value) {
  const normalized = value / 255;

  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color) {
  const [ red, green, blue ] = color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));

  return (lighter + 0.05) / (darker + 0.05);
}

function tokenColor(frameDocument, frameWindow, name) {
  const probe = frameDocument.createElement("div");
  probe.style.color = `var(${name}, ${missingTokenSentinel})`;

  frameDocument.body.appendChild(probe);
  const resolved = frameWindow.getComputedStyle(probe).color;
  probe.remove();

  return resolved;
}

function requireTokenColor(frameDocument, frameWindow, name) {
  const resolved = tokenColor(frameDocument, frameWindow, name);

  return resolved === missingTokenSentinel ? { name, missing: true } : { name, color: resolved };
}

function readCssRules(sheet) {
  try {
    return [ ...sheet.cssRules ];
  } catch (error) {
    return [];
  }
}

function outlineWidthOf(styleDeclaration) {
  if (styleDeclaration.outlineWidth) return styleDeclaration.outlineWidth;

  const match = styleDeclaration.outline.match(/\d+(\.\d+)?px/);

  return match ? match[0] : "";
}

function outlineStyleOf(styleDeclaration) {
  if (styleDeclaration.outlineStyle) return styleDeclaration.outlineStyle;

  const match = styleDeclaration.outline.match(/\b(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)\b/);

  return match ? match[0] : "";
}

function outlineIsAccentColored(styleDeclaration) {
  if (styleDeclaration.outlineColor) return /var\(--accent[,)]/.test(styleDeclaration.outlineColor);

  return /var\(--accent[,)]/.test(styleDeclaration.outline);
}

function millisecondsFromDuration(value) {
  const match = value.trim().match(/^(-?\d+(\.\d+)?)(ms|s)$/);

  if (!match) return null;

  const [ , number, , unit ] = match;

  return unit === "s" ? Number(number) * 1000 : Number(number);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const CHECKS = [
  {
    name: "--accent-text on --background meets 4.5:1",
    run: (frameDocument, frameWindow) => {
      const accentText = requireTokenColor(frameDocument, frameWindow, "--accent-text");
      const background = requireTokenColor(frameDocument, frameWindow, "--background");

      if (accentText.missing) return `${accentText.name} is not defined`;
      if (background.missing) return `${background.name} is not defined`;

      const ratio = contrast(accentText.color, background.color);

      return ratio >= 4.5 ? true : `ratio ${ratio.toFixed(2)}`;
    },
  },
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
    name: "--link resolves to --accent-text",
    run: (frameDocument, frameWindow) => {
      const link = requireTokenColor(frameDocument, frameWindow, "--link");
      const accentText = requireTokenColor(frameDocument, frameWindow, "--accent-text");

      if (link.missing) return `${link.name} is not defined`;
      if (accentText.missing) return `${accentText.name} is not defined`;

      return link.color === accentText.color ? true : `link ${link.color} is not accent-text ${accentText.color}`;
    },
  },
  {
    name: "no text rule paints with --accent",
    run: async () => {
      const source = await fetch("./styles/components.css").then((response) => response.text());
      const offenders = [ ...source.matchAll(/([^{}]+)\{([^}]*)\}/g) ]
        .filter(([ , selector, body ]) => /(^|[;{])\s*color:\s*[^;]*var\(--accent[,)][^;]*;/.test(body) && !selector.includes(".icon"))
        .map(([ , selector ]) => selector.trim());

      return offenders.length === 0 ? true : offenders.join(" / ");
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
    name: "base.css declares a default focus ring",
    run: (frameDocument) => {
      const rules = [ ...frameDocument.styleSheets ]
        .flatMap(readCssRules)
        .filter((rule) => rule.selectorText && rule.selectorText.includes(":focus-visible"));

      const base = rules.find((rule) => rule.selectorText.includes("button") && rule.selectorText.includes("input"));

      if (!base) return "no default :focus-visible rule";

      const outlineWidth = outlineWidthOf(base.style);
      const outlineStyle = outlineStyleOf(base.style);

      if (outlineWidth !== "2px") return `outline-width is ${outlineWidth}`;
      if (base.style.outlineOffset !== "-2px") return `outline-offset is ${base.style.outlineOffset}`;
      if (outlineStyle !== "solid") return `outline-style is ${outlineStyle}`;
      if (!outlineIsAccentColored(base.style)) return "outline color is not var(--accent)";

      return true;
    },
  },
  {
    name: "no rule removes the outline without a replacement",
    run: (frameDocument) => {
      const offenders = [ ...frameDocument.styleSheets ]
        .flatMap(readCssRules)
        .filter((rule) => rule.style && (rule.style.outlineStyle === "none" || rule.style.outlineWidth === "0px"))
        .filter((rule) => !rule.style.borderColor && !rule.style.textDecorationThickness);

      return offenders.length === 0 ? true : offenders.map((rule) => rule.selectorText).join(", ");
    },
  },
  {
    name: "base.css honours prefers-reduced-motion",
    run: (frameDocument) => {
      const blocks = [ ...frameDocument.styleSheets ]
        .flatMap(readCssRules)
        .filter((rule) => rule.media && rule.conditionText.includes("prefers-reduced-motion"));

      if (blocks.length === 0) return "no prefers-reduced-motion block";

      const declarations = [ ...blocks[0].cssRules ][0].style;

      const transitionDuration = declarations.getPropertyValue("transition-duration").split(",")[0].trim();
      const animationDuration = declarations.getPropertyValue("animation-duration").split(",")[0].trim();

      if (!transitionDuration) return "transition-duration not collapsed";
      if (!animationDuration) return "animation-duration not collapsed";

      const transitionMilliseconds = millisecondsFromDuration(transitionDuration);
      const animationMilliseconds = millisecondsFromDuration(animationDuration);

      if (transitionMilliseconds === null || transitionMilliseconds > 0.01) return `transition-duration is ${transitionDuration}`;
      if (animationMilliseconds === null || animationMilliseconds > 0.01) return `animation-duration is ${animationDuration}`;

      if (declarations.getPropertyPriority("transition-duration") !== "important") return "transition-duration is missing !important";
      if (declarations.getPropertyPriority("animation-duration") !== "important") return "animation-duration is missing !important";

      return true;
    },
  },
  {
    name: "components.css carries no ID selectors",
    run: async () => {
      const source = await fetch("./styles/components.css").then((response) => response.text());
      const selectors = [ ...source.matchAll(/[^{}]*\{/g) ].map((match) => match[0]).join(" ");
      const offenders = [ ...selectors.matchAll(/#[a-zA-Z][\w-]*/g) ].map((match) => match[0]);

      return offenders.length === 0 ? true : offenders.join(", ");
    },
  },
  {
    name: "components.css carries no domain nouns",
    run: async () => {
      const source = await fetch("./styles/components.css").then((response) => response.text());
      const offenders = [ ...source.matchAll(/\.[\w-]*(?:track|playlist|render)[\w-]*/g) ].map((match) => match[0]);

      return offenders.length === 0 ? true : offenders.join(", ");
    },
  },
  {
    name: "the component vocabulary is present",
    run: async () => {
      const source = await fetch("./styles/components.css").then((response) => response.text());
      const required = [
        ".action-primary", ".action-add", ".action-cancel", ".action-resume",
        ".caption-warning", ".status-message", ".item", ".item-label", ".item-remove",
      ];
      const missing = required.filter((name) => !new RegExp(`${escapeRegExp(name)}(?![\\w-])`).test(source));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
  {
    name: "the page does not scroll sideways at this width",
    run: (frameDocument) => {
      const main = frameDocument.querySelector("main");

      return main.scrollWidth > main.clientWidth
        ? `scrollWidth ${main.scrollWidth} > clientWidth ${main.clientWidth}`
        : true;
    },
  },
  {
    name: "main is single-column below 900px",
    run: (frameDocument, frameWindow) => {
      const main = frameDocument.querySelector("main");
      const columns = frameWindow.getComputedStyle(main).gridTemplateColumns.split(" ").length;

      if (frameWindow.innerWidth >= 900) return columns === 2 ? true : `${columns} columns at wide width`;

      return columns === 1 ? true : `${columns} columns at ${frameWindow.innerWidth}px`;
    },
  },
  {
    name: "field bodies are container queried",
    run: (frameDocument, frameWindow) => {
      const body = frameDocument.querySelector(".field-body");

      if (!body) return true;

      return frameWindow.getComputedStyle(body).containerType === "inline-size"
        ? true
        : "container-type not set";
    },
  },
  {
    name: "icons use a 24-unit viewBox",
    run: async () => {
      const { ICONS } = await import("./src/icons.js");
      const wrong = Object.entries(ICONS)
        .filter(([ , spec ]) => spec.viewBox !== "0 0 24 24")
        .map(([ name ]) => name);

      return wrong.length === 0 ? true : wrong.join(", ");
    },
  },
  {
    name: "icons still render at 16px",
    run: async () => {
      const { icon } = await import("./src/icons.js");
      const svg = icon("check");

      if (svg.getAttribute("width") !== "16") return `width ${svg.getAttribute("width")}`;
      if (svg.getAttribute("aria-hidden") !== "true") return "missing aria-hidden";

      return true;
    },
  },
  {
    name: "the viewport is the width that was asked for",
    run: (frameDocument, frameWindow) => {
      const requested = Number(new URL(frameWindow.location.href).searchParams.get("expect-width"));

      if (!requested) return true;

      return Math.abs(frameWindow.innerWidth - requested) <= 1
        ? true
        : `innerWidth ${frameWindow.innerWidth} but ${requested} was requested`;
    },
  },
];
