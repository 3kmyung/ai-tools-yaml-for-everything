import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, pickLocalized, type Locale, type Localized } from "../core/locale";
import { SHELL_STRINGS } from "./dictionaries";
import type { ShellStrings } from "./shell-strings";

export interface LocaleControls {
  locale: Locale;
  strings: ShellStrings;
  pick: (localized: Localized) => string;
  setLocale: (locale: Locale) => void;
}

export function localeControlsFor(locale: Locale, setLocale: (locale: Locale) => void): LocaleControls {
  return { locale, strings: SHELL_STRINGS[locale], pick: (localized) => pickLocalized(localized, locale), setLocale };
}

export const LocaleContext = createContext<LocaleControls>(localeControlsFor(DEFAULT_LOCALE, () => undefined));

export function useLocale(): LocaleControls {
  return useContext(LocaleContext);
}
