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
      const missing = breakpoints.filter((breakpoint) => !source.includes(breakpoint));

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
