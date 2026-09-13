const missingTokenSentinel = "rgb(1, 2, 3)";
const categoryCount = 8;
const categoryDistanceFloor = 16;
const referenceWhite = [ 0.95047, 1, 1.08883 ];

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

function labPivot(value) {
  const delta = 6 / 29;

  return value > delta ** 3 ? Math.cbrt(value) : value / (3 * delta * delta) + 4 / 29;
}

function labFromColor(color) {
  const [ red, green, blue ] = color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

  const linearRed = channel(red);
  const linearGreen = channel(green);
  const linearBlue = channel(blue);

  const x = linearRed * 0.4124564 + linearGreen * 0.3575761 + linearBlue * 0.1804375;
  const y = linearRed * 0.2126729 + linearGreen * 0.7151522 + linearBlue * 0.0721750;
  const z = linearRed * 0.0193339 + linearGreen * 0.1191920 + linearBlue * 0.9503041;

  const fx = labPivot(x / referenceWhite[0]);
  const fy = labPivot(y / referenceWhite[1]);
  const fz = labPivot(z / referenceWhite[2]);

  return [ 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz) ];
}

function ciede2000(labFirst, labSecond) {
  const [ lightnessFirst, aFirst, bFirst ] = labFirst;
  const [ lightnessSecond, aSecond, bSecond ] = labSecond;

  const chromaFirst = Math.sqrt(aFirst * aFirst + bFirst * bFirst);
  const chromaSecond = Math.sqrt(aSecond * aSecond + bSecond * bSecond);
  const chromaMean = (chromaFirst + chromaSecond) / 2;

  const chromaCorrection = 0.5 * (1 - Math.sqrt(chromaMean ** 7 / (chromaMean ** 7 + 25 ** 7)));

  const aFirstPrime = aFirst * (1 + chromaCorrection);
  const aSecondPrime = aSecond * (1 + chromaCorrection);

  const chromaFirstPrime = Math.sqrt(aFirstPrime * aFirstPrime + bFirst * bFirst);
  const chromaSecondPrime = Math.sqrt(aSecondPrime * aSecondPrime + bSecond * bSecond);

  const hueFirstPrime = (Math.atan2(bFirst, aFirstPrime) + 2 * Math.PI) % (2 * Math.PI);
  const hueSecondPrime = (Math.atan2(bSecond, aSecondPrime) + 2 * Math.PI) % (2 * Math.PI);

  const deltaLightnessPrime = lightnessSecond - lightnessFirst;
  const deltaChromaPrime = chromaSecondPrime - chromaFirstPrime;

  const chromaProduct = chromaFirstPrime * chromaSecondPrime;
  const hueDifference = hueSecondPrime - hueFirstPrime;

  let deltaHuePrime;
  if (chromaProduct === 0) deltaHuePrime = 0;
  else if (Math.abs(hueDifference) <= Math.PI) deltaHuePrime = hueDifference;
  else if (hueDifference > Math.PI) deltaHuePrime = hueDifference - 2 * Math.PI;
  else deltaHuePrime = hueDifference + 2 * Math.PI;

  const deltaChromaHuePrime = 2 * Math.sqrt(chromaProduct) * Math.sin(deltaHuePrime / 2);

  const lightnessMeanPrime = (lightnessFirst + lightnessSecond) / 2;
  const chromaMeanPrime = (chromaFirstPrime + chromaSecondPrime) / 2;
  const hueSum = hueFirstPrime + hueSecondPrime;

  let hueMeanPrime;
  if (chromaProduct === 0) hueMeanPrime = hueSum;
  else if (Math.abs(hueFirstPrime - hueSecondPrime) <= Math.PI) hueMeanPrime = hueSum / 2;
  else if (hueSum < 2 * Math.PI) hueMeanPrime = (hueSum + 2 * Math.PI) / 2;
  else hueMeanPrime = (hueSum - 2 * Math.PI) / 2;

  const toDegrees = (angleInRadians) => (angleInRadians * 180) / Math.PI;
  const toRadians = (angleInDegrees) => (angleInDegrees * Math.PI) / 180;

  const hueWeighting = 1
    - 0.17 * Math.cos(hueMeanPrime - toRadians(30))
    + 0.24 * Math.cos(2 * hueMeanPrime)
    + 0.32 * Math.cos(3 * hueMeanPrime + toRadians(6))
    - 0.20 * Math.cos(4 * hueMeanPrime - toRadians(63));

  const hueRotationAngle = toRadians(30) * Math.exp(-(((toDegrees(hueMeanPrime) - 275) / 25) ** 2));
  const hueRotationTerm = 2 * Math.sqrt(chromaMeanPrime ** 7 / (chromaMeanPrime ** 7 + 25 ** 7));

  const lightnessScale = 1 + (0.015 * (lightnessMeanPrime - 50) ** 2) / Math.sqrt(20 + (lightnessMeanPrime - 50) ** 2);
  const chromaScale = 1 + 0.045 * chromaMeanPrime;
  const hueScale = 1 + 0.015 * chromaMeanPrime * hueWeighting;

  const crossTerm = -Math.sin(2 * hueRotationAngle) * hueRotationTerm;

  const lightnessTerm = deltaLightnessPrime / lightnessScale;
  const chromaTerm = deltaChromaPrime / chromaScale;
  const hueTerm = deltaChromaHuePrime / hueScale;

  return Math.sqrt(lightnessTerm ** 2 + chromaTerm ** 2 + hueTerm ** 2 + crossTerm * chromaTerm * hueTerm);
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

  const match = styleDeclaration.outline.match(/var\(--border-width\)|\d+(\.\d+)?px/);

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

function borderColorOf(styleDeclaration) {
  if (styleDeclaration.borderColor) return styleDeclaration.borderColor;

  const match = styleDeclaration.border.match(/var\([^)]*\)|#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)/);

  return match ? match[0] : "";
}

function selectorNamesTag(selectorText, tag) {
  return new RegExp(`(^|[\\s,(])${tag}(?![\\w-])`).test(selectorText);
}

function isDefaultFocusRule(rule) {
  return [ "button", "a", "input", "select" ].every((tag) => selectorNamesTag(rule.selectorText, tag));
}

function gridTrackCount(value) {
  if (value === "none") return 0;

  let depth = 0;
  let count = 1;

  for (const character of value) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === " " && depth === 0) count += 1;
  }

  return count;
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
const lineWidthDeclaration = /(?:^|[;{\s])(border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-width)?|outline(?:-width|-offset)?|text-decoration-thickness)\s*:\s*([^;]*)/g;
const literalLength = /(?:^|[\s(,])-?\d*\.?\d+(?:px|rem|em)\b/;

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
        .filter(({ selector, body }) => /(^|[;{])\s*color:\s*[^;]*var\(--accent[,)][^;]*;/.test(body) && !/\.icon(?![\w-])/.test(selector))
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

      const base = rules.find(isDefaultFocusRule);

      if (!base) return "no default :focus-visible rule";

      const outlineWidth = outlineWidthOf(base.style);
      const outlineStyle = outlineStyleOf(base.style);

      if (outlineWidth !== "var(--border-width)") return `outline-width is ${outlineWidth}`;
      if (base.style.outlineOffset.replace(/\s+/g, "") !== "calc(-1*var(--border-width))") return `outline-offset is ${base.style.outlineOffset}`;
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
        .filter((rule) => !borderColorOf(rule.style) && !rule.style.textDecorationThickness);

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
    name: "main does not scroll sideways at this width",
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
      const style = frameWindow.getComputedStyle(main);
      const isGrid = style.display === "grid" || style.display === "inline-grid";
      const columns = isGrid ? gridTrackCount(style.gridTemplateColumns) : 1;

      if (frameWindow.innerWidth >= 900) {
        if (!isGrid) return `display is ${style.display} at wide width`;

        return columns === 2 ? true : `${columns} columns at wide width`;
      }

      return columns <= 1 ? true : `${columns} columns at ${frameWindow.innerWidth}px`;
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
    name: `--category-1 through --category-${categoryCount} clear 3:1 on --background and --background-panel`,
    run: (frameDocument, frameWindow) => {
      const surfaceTokens = [ "--background", "--background-panel" ];

      const failures = [];

      for (let category = 1; category <= categoryCount; category += 1) {
        const marker = requireTokenColor(frameDocument, frameWindow, `--category-${category}`);

        if (marker.missing) {
          failures.push(`${marker.name} is not defined`);
          continue;
        }

        for (const surfaceToken of surfaceTokens) {
          const surface = requireTokenColor(frameDocument, frameWindow, surfaceToken);

          if (surface.missing) {
            failures.push(`${surface.name} is not defined`);
            continue;
          }

          const ratio = contrast(marker.color, surface.color);

          if (ratio < 3) failures.push(`${marker.name} on ${surfaceToken} is ${ratio.toFixed(2)}`);
        }
      }

      return failures.length === 0 ? true : failures.join(" / ");
    },
  },
  {
    name: `every pair of --category-* tokens clears a CIEDE2000 of ${categoryDistanceFloor}`,
    run: (frameDocument, frameWindow) => {
      const markers = Array.from({ length: categoryCount }, (unused, index) => requireTokenColor(frameDocument, frameWindow, `--category-${index + 1}`));
      const missing = markers.filter((marker) => marker.missing);

      if (missing.length > 0) return missing.map((marker) => `${marker.name} is not defined`).join(" / ");

      const labs = markers.map((marker) => labFromColor(marker.color));

      const failures = [];

      for (let firstIndex = 0; firstIndex < markers.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < markers.length; secondIndex += 1) {
          const distance = ciede2000(labs[firstIndex], labs[secondIndex]);

          if (distance < categoryDistanceFloor) {
            failures.push(`${markers[firstIndex].name} vs ${markers[secondIndex].name} is ${distance.toFixed(2)}`);
          }
        }
      }

      return failures.length === 0 ? true : failures.join(" / ");
    },
  },
  {
    name: "no border or outline width is a literal length",
    run: async () => {
      const paths = [ "./styles/base.css", "./styles/components.css", "./styles/layout.css" ];
      const sources = await Promise.all(paths.map(stylesheetSource));

      const offenders = sources.flatMap((source) => extractStyleRules(source)
        .flatMap(({ selector, body }) => [ ...body.matchAll(lineWidthDeclaration) ]
          .filter((match) => literalLength.test(match[2]))
          .map((match) => `${selector} { ${match[1]}: ${match[2].trim()} }`)));

      return offenders.length === 0 ? true : offenders.join(" / ");
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
