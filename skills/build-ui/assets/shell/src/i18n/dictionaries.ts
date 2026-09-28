import type { Locale } from "../core/locale";
import { EN } from "./en";
import { KO } from "./ko";
import type { ShellStrings } from "./shell-strings";
import { ZH } from "./zh";

export const SHELL_STRINGS: Readonly<Record<Locale, ShellStrings>> = { en: EN, ko: KO, zh: ZH };

export function fillTemplate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in values ? String(values[name]) : placeholder));
}
