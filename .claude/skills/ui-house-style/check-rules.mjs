import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const reference = resolve(process.argv[2]);

async function fencedBlock(referenceFile, language) {
  const source = await readFile(join(here, "references", referenceFile), "utf8");
  const match = source.match(new RegExp("```" + language + "\\n([\\s\\S]*?)```"));

  return match ? match[1] : null;
}

function widthBreakpoints(styleSheet) {
  const mediaQueries = styleSheet.match(/@media[^{]+/g) || [];
  const breakpoints = new Set();

  for (const mediaQuery of mediaQueries) {
    if (!mediaQuery.includes("width")) continue;

    const pixelValues = mediaQuery.match(/\d+px/g) || [];

    pixelValues.forEach((pixelValue) => breakpoints.add(pixelValue));
  }

  return Array.from(breakpoints);
}

const RULES = [
  {
    name: "tokens.md embeds base.css verbatim",
    run: async () => {
      const quoted = await fencedBlock("tokens.md", "css");
      const actual = await readFile(join(reference, "styles/base.css"), "utf8");

      return quoted === actual ? true : "the embedded block differs from styles/base.css";
    },
  },
  {
    name: "layout.md states every width breakpoint in layout.css",
    run: async () => {
      const styleSheet = await readFile(join(reference, "styles/layout.css"), "utf8");
      const source = await readFile(join(here, "references/layout.md"), "utf8");

      const breakpoints = widthBreakpoints(styleSheet);

      if (breakpoints.length === 0) return "found no width breakpoints in styles/layout.css to check";

      const missing = breakpoints.filter((breakpoint) => !source.includes(breakpoint));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
  {
    name: "components.md names only classes that exist",
    run: async () => {
      const source = await readFile(join(here, "references/components.md"), "utf8");
      const actual = await readFile(join(reference, "styles/components.css"), "utf8");
      const named = [ ...new Set([ ...source.matchAll(/`(\.[a-z][\w-]*)`/g) ].map((match) => match[1])) ];
      const missing = named.filter((name) => !actual.includes(name));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
  {
    name: "css-patterns.md writes every ban as ban, replacement, reason",
    run: async () => {
      const source = await readFile(join(here, "references/css-patterns.md"), "utf8");
      const bans = [ ...source.matchAll(/^✗ .*$/gm) ].length;
      const replacements = [ ...source.matchAll(/^→ .*$/gm) ].length;
      const reasons = [ ...source.matchAll(/^Why: .*$/gm) ].length;

      if (bans === 0) return "no bans found";

      return bans === replacements && bans === reasons
        ? true
        : `${bans} bans, ${replacements} replacements, ${reasons} reasons`;
    },
  },
  {
    name: "js-patterns.md bans the habits the reference avoids",
    run: async () => {
      const source = await readFile(join(here, "references/js-patterns.md"), "utf8");
      const required = [ "innerHTML", "export default", "replaceChildren", "hidden", "class" ];
      const missing = required.filter((term) => !source.includes(term));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
];

let failed = false;

for (const rule of RULES) {
  const outcome = await rule.run();

  console.log((outcome === true ? "PASS " : "FAIL ") + rule.name + (outcome === true ? "" : " — " + outcome));
  if (outcome !== true) failed = true;
}

process.exit(failed ? 1 : 0);
