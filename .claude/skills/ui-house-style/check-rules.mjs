import { readdir, readFile } from "node:fs/promises";
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

function namedClasses(source) {
  const backtickSpans = [ ...source.matchAll(/`([^`\n]*)`/g) ].map((match) => match[1]);
  const names = new Set();

  for (const span of backtickSpans) {
    for (const match of span.matchAll(/(?:^|[^\w.])(\.[a-z][\w-]*)(\*)?/g)) {
      names.add(match[1] + (match[2] || ""));
    }
  }

  return Array.from(names);
}

function classExists(styleSheet, name) {
  const isFamilyReference = name.endsWith("*");
  const stem = isFamilyReference ? name.slice(0, -1) : name;
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const pattern = isFamilyReference
    ? new RegExp(escaped + "[\\w-]")
    : new RegExp(escaped + "(?![\\w-])");

  return pattern.test(styleSheet);
}

function markerLines(source) {
  return source.split("\n").filter((line) => /^\s*(✗|→|Why:) /.test(line));
}

function linesStartingWith(source, marker) {
  return source.split("\n").filter((line) => line.startsWith(marker));
}

async function referenceMarkdownFiles() {
  const entries = await readdir(join(here, "references"));

  return entries.filter((entry) => entry.endsWith(".md"));
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
      const named = namedClasses(source);
      const missing = named.filter((name) => !classExists(actual, name));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
  {
    name: "every reference file writes bans as ban, replacement, reason",
    run: async () => {
      const files = await referenceMarkdownFiles();
      const brokenFiles = [];

      for (const file of files) {
        const source = await readFile(join(here, "references", file), "utf8");
        const markers = markerLines(source).map((line) => line.match(/^\s*(✗|→|Why:)/)[1]);
        const bans = markers.filter((marker) => marker === "✗").length;

        if (bans === 0) continue;

        const expected = Array.from({ length: bans }, () => [ "✗", "→", "Why:" ]).flat();
        const matches = markers.length === expected.length && markers.every((marker, index) => marker === expected[index]);

        if (!matches) brokenFiles.push(`${file}: ${markers.join(" ")}`);
      }

      return brokenFiles.length === 0 ? true : brokenFiles.join("; ");
    },
  },
  {
    name: "js-patterns.md bans the habits the reference avoids",
    run: async () => {
      const source = await readFile(join(here, "references/js-patterns.md"), "utf8");
      const bannedTerms = [ "innerHTML", "export default", "class" ];
      const mandatedTerms = [ "replaceChildren", "hidden" ];

      const banLines = linesStartingWith(source, "✗ ");
      const replacementLines = linesStartingWith(source, "→ ");

      const missingBans = bannedTerms.filter((term) => !banLines.some((line) => line.includes(term)));
      const missingMandates = mandatedTerms.filter((term) => !replacementLines.some((line) => line.includes(term)));
      const missing = [ ...missingBans, ...missingMandates ];

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
  {
    name: "streaming.md covers all fourteen rules",
    run: async () => {
      const source = await readFile(join(here, "references/streaming.md"), "utf8");
      const required = [
        "overflow-y", "pinned", "--text-caption", "translate", "tabular-nums",
        "requestAnimationFrame", "aria-live", "showProgress", "user gesture",
        "red dot", "<meter>", "label", "WebAudio", "prefers-reduced-motion",
      ];
      const missing = required.filter((term) => !source.includes(term));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
];

let failed = false;

for (const rule of RULES) {
  let outcome;

  try {
    outcome = await rule.run();
  } catch (error) {
    outcome = error.message;
  }

  console.log((outcome === true ? "PASS " : "FAIL ") + rule.name + (outcome === true ? "" : " — " + outcome));
  if (outcome !== true) failed = true;
}

process.exit(failed ? 1 : 0);
