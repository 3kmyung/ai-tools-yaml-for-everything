import { useCallback, useEffect, useMemo, useState } from "react";
import { documentLanguageOf, resolveLocale, type Locale } from "../core/locale";
import { localeControlsFor, type LocaleControls } from "../i18n/locale-context";
import { readStoredLocale, storeLocale } from "../i18n/locale-storage";

function resolveInitialLocale(): Locale {
  return resolveLocale(window.location.search, readStoredLocale(), navigator.languages ?? []);
}

export function useLocaleState(): LocaleControls {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    storeLocale(next);
    setLocaleState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = documentLanguageOf(locale);
  }, [locale]);

  return useMemo(() => localeControlsFor(locale, setLocale), [locale, setLocale]);
}
