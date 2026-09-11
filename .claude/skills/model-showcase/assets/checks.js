const missingTokenSentinel = "rgb(1, 2, 3)";

function channel(value) {
  const normalized = value / 255;

  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color) {
  const [ red, green, blue ] = color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));

  return (lighter + 0.05) / (darker + 0.05);
}

export function requireTokenColor(frameDocument, frameWindow, name) {
  const probe = frameDocument.createElement("div");
  probe.style.color = `var(${name}, ${missingTokenSentinel})`;

  frameDocument.body.appendChild(probe);
  const resolved = frameWindow.getComputedStyle(probe).color;
  probe.remove();

  return resolved === missingTokenSentinel ? { name, missing: true } : { name, color: resolved };
}

function flattenCssRules(rules) {
  return rules.flatMap((rule) => (rule.cssRules ? [ rule, ...flattenCssRules([ ...rule.cssRules ]) ] : [ rule ]));
}

function readCssRules(sheet) {
  try {
    return flattenCssRules([ ...sheet.cssRules ]);
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

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const groupingAtRule = /^@(media|supports|container|starting-style|layer|scope)\b/i;
const opaqueAtRule = /^@(-webkit-)?(keyframes|property|font-face|page|counter-style|font-palette-values)\b/i;

function matchingBraceIndex(source, openIndex) {
  let depth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function extractStyleRules(source) {
  const rules = [];
  let cursor = 0;

  while (cursor < source.length) {
    const openIndex = source.indexOf("{", cursor);

    if (openIndex === -1) break;

    const closeIndex = matchingBraceIndex(source, openIndex);

    if (closeIndex === -1) break;

    const prelude = source.slice(cursor, openIndex).trim();
    const body = source.slice(openIndex + 1, closeIndex);

    if (groupingAtRule.test(prelude)) rules.push(...extractStyleRules(body));
    else if (!opaqueAtRule.test(prelude)) rules.push({ selector: prelude, body });

    cursor = closeIndex + 1;
  }

  return rules;
}

export async function stylesheetSource(path) {
  const response = await fetch(path);

  if (!response.ok) throw new Error(`${path} returned ${response.status}`);

  return response.text();
}

export const CHECKS = [
  {
    name: "--accent-text and --text-caption meet 4.5:1 on --background and --background-panel",
    run: (frameDocument, frameWindow) => {
      const textTokens = [ "--accent-text", "--text-caption" ];
      const surfaceTokens = [ "--background", "--background-panel" ];

      const failures = [];

      for (const textToken of textTokens) {
        const foreground = requireTokenColor(frameDocument, frameWindow, textToken);

        if (foreground.missing) {
          failures.push(`${foreground.name} is not defined`);
          continue;
        }

        for (const surfaceToken of surfaceTokens) {
          const surface = requireTokenColor(frameDocument, frameWindow, surfaceToken);

          if (surface.missing) {
            failures.push(`${surface.name} is not defined`);
            continue;
          }

          const ratio = contrast(foreground.color, surface.color);

          if (ratio < 4.5) failures.push(`${textToken} on ${surfaceToken} is ${ratio.toFixed(3)}`);
        }
      }

      return failures.length === 0 ? true : failures.join(" / ");
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
      const sources = await Promise.all([
        stylesheetSource("./styles/components.css"),
        stylesheetSource("./styles/layout.css"),
      ]);

      const offenders = sources.flatMap((source) => extractStyleRules(source)
        .filter(({ selector, body }) => /(^|[;{])\s*color:\s*[^;]*var\(--accent[,)][^;]*;/.test(body) && !selector.includes(".icon"))
        .map(({ selector }) => selector));

      return offenders.length === 0 ? true : offenders.join(" / ");
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
      const source = await stylesheetSource("./styles/components.css");
      const selectors = [ ...source.matchAll(/[^{}]*\{/g) ].map((match) => match[0]).join(" ");
      const offenders = [ ...selectors.matchAll(/#[a-zA-Z][\w-]*/g) ].map((match) => match[0]);

      return offenders.length === 0 ? true : offenders.join(", ");
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
    name: "icons use a 24-unit viewBox",
    run: async () => {
      const { ICONS } = await import("./src/icons.js");

      if (Object.keys(ICONS).length === 0) return "ICONS is empty";

      const wrong = Object.entries(ICONS)
        .filter(([ , definition ]) => definition.viewBox !== "0 0 24 24")
        .map(([ name ]) => name);

      return wrong.length === 0 ? true : wrong.join(", ");
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
