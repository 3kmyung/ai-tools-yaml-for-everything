export const LOCALES = ["en", "ko", "zh"] as const;

export type Locale = (typeof LOCALES)[number];

export type Localized = Readonly<Record<Locale, string>>;

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_QUERY_KEY = "lang";

const DOCUMENT_LANGUAGES: Readonly<Record<Locale, string>> = {
  en: "en",
  ko: "ko",
  zh: "zh-Hans",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

function primarySubtag(language: string): string {
  return language.split(/[-_]/)[0]?.toLowerCase() ?? "";
}

export function resolveLocale(query: string, stored: string | null, languages: readonly string[]): Locale {
  const requested = new URLSearchParams(query).get(LOCALE_QUERY_KEY);
  if (isLocale(requested)) return requested;
  if (isLocale(stored)) return stored;

  const preferred = languages.map(primarySubtag).find(isLocale);
  return preferred ?? DEFAULT_LOCALE;
}

export function documentLanguageOf(locale: Locale): string {
  return DOCUMENT_LANGUAGES[locale];
}

export function pickLocalized(localized: Localized, locale: Locale): string {
  return localized[locale];
}
