import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = join(process.cwd(), "src");

interface SourceFile {
  path: string;
  text: string;
}

function collectSources(directory: string, prefix = ""): SourceFile[] {
  return readdirSync(join(SOURCE_ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return collectSources(join(directory, entry.name), relative);
    if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".ts")) return [];
    return [{ path: relative, text: readFileSync(join(SOURCE_ROOT, directory, entry.name), "utf8") }];
  });
}

const SOURCES = collectSources(".");

function linesMatching(source: SourceFile, pattern: RegExp): string[] {
  return source.text
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => pattern.test(line))
    .map(({ number }) => `${source.path}:${number}`);
}

const everywhere = () => true;

function findMatches(pattern: RegExp, inPath: (path: string) => boolean = everywhere): string[] {
  return SOURCES.filter(({ path }) => inPath(path)).flatMap((source) => linesMatching(source, pattern));
}

const outsideUi = (path: string) => !path.startsWith("ui/");

describe("sizes and radii", () => {
  it("never spell a font size as a raw px value", () => {
    expect(findMatches(/text-\[\d+px\]/)).toEqual([]);
  });

  it("never spell a rounding as an arbitrary value", () => {
    expect(findMatches(/rounded-\[/)).toEqual([]);
  });
});

describe("bordered surfaces", () => {
  it("are built only inside ui/, never by hand in a feature or a release", () => {
    expect(findMatches(/border-hairline/, outsideUi)).toEqual([]);
  });
});

describe("media", () => {
  it("never shows the browser's own player controls", () => {
    expect(findMatches(/<(audio|video)\b[^>]*\bcontrols\b/)).toEqual([]);
  });
});
