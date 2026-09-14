import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

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

async function skillMarkdownSources() {
  const files = await referenceMarkdownFiles();
  const references = await Promise.all(files.map(async (file) => ({
    file: `references/${file}`,
    source: await readFile(join(here, "references", file), "utf8"),
  })));
  const skill = { file: "SKILL.md", source: await readFile(join(here, "SKILL.md"), "utf8") };

  return [ skill, ...references ];
}

const RULES = [
  {
    name: "no file depends on a shipped interface",
    run: async () => {
      const sources = await skillMarkdownSources();
      const offenders = sources
        .filter(({ source }) => /(?:^|[\s`(])(?:releases|examples)\//.test(source))
        .map(({ file }) => file);

      return offenders.length === 0 ? true : offenders.join(", ");
    },
  },
  {
    name: "tokens.md embeds a base.css with every scale",
    run: async () => {
      const source = await readFile(join(here, "references/tokens.md"), "utf8");
      const match = source.match(/```css\n([\s\S]*?)```/);

      if (!match) return "found no css block in tokens.md";

      const required = [ "--space-1", "--text-sm", "--radius-sm", "--border-width", "--duration-fast", "--category-1" ];
      const missing = required.filter((token) => !match[1].includes(`${token}:`));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
  {
    name: "layout.md keeps the one-column narrow width",
    run: async () => {
      const source = await readFile(join(here, "references/layout.md"), "utf8");
      const missing = [ "@media (width < 600px)" ].filter((breakpoint) => !source.includes(breakpoint));

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
    name: "js-patterns.md bans the habits the house style avoids",
    run: async () => {
      const source = await readFile(join(here, "references/js-patterns.md"), "utf8");
      const bannedTerms = [
        { term: "innerHTML", matches: (line) => line.includes("innerHTML") },
        { term: "export default", matches: (line) => line.includes("export default") },
        { term: "class", matches: (line) => /\bclass\s+[A-Za-z_$]/.test(line) },
      ];
      const mandatedTerms = [ "replaceChildren", "hidden" ];

      const banLines = linesStartingWith(source, "✗ ");
      const replacementLines = linesStartingWith(source, "→ ");

      const missingBans = bannedTerms.filter((entry) => !banLines.some(entry.matches)).map((entry) => entry.term);
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
        "requestAnimationFrame", "aria-live", "status bar", "user gesture",
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
