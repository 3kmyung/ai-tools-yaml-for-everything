import { describe, expect, it } from "vitest";
import { LOCALES } from "../../src/core/locale";
import { fillTemplate, SHELL_STRINGS } from "../../src/i18n/dictionaries";

function flatten(value: unknown, prefix = ""): [string, unknown][] {
  if (typeof value !== "object" || value === null) return [[prefix, value]];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix === "" ? key : `${prefix}.${key}`));
}

describe("shell dictionaries", () => {
  it("have identical key sets in every locale", () => {
    const keySets = LOCALES.map((locale) => flatten(SHELL_STRINGS[locale]).map(([key]) => key).sort());
    for (const keys of keySets) expect(keys).toEqual(keySets[0]);
  });

  it("have no empty strings", () => {
    const empty = LOCALES.flatMap((locale) =>
      flatten(SHELL_STRINGS[locale])
        .filter(([, text]) => typeof text !== "string" || text.trim() === "")
        .map(([key]) => `${locale}.${key}`),
    );
    expect(empty).toEqual([]);
  });

  it("use the same placeholders in every locale", () => {
    const placeholdersOf = (text: unknown) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const english = new Map(flatten(SHELL_STRINGS.en));
    const mismatched = LOCALES.flatMap((locale) =>
      flatten(SHELL_STRINGS[locale])
        .filter(([key, text]) => placeholdersOf(text).join() !== placeholdersOf(english.get(key)).join())
        .map(([key]) => `${locale}.${key}`),
    );
    expect(mismatched).toEqual([]);
  });

  it("name each language in that language", () => {
    expect(LOCALES.map((locale) => SHELL_STRINGS[locale].language.name)).toEqual(["English", "한국어", "简体中文"]);
  });
});

describe("fillTemplate", () => {
  it("fills known placeholders and leaves unknown ones", () => {
    expect(fillTemplate("Remove {name} {other}", { name: "a.bin" })).toBe("Remove a.bin {other}");
    expect(fillTemplate("{seconds}초 뒤로", { seconds: 10 })).toBe("10초 뒤로");
  });
});
