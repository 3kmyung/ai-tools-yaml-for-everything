import { Languages } from "lucide-react";
import { isLocale, LOCALES } from "../../core/locale";
import { SHELL_STRINGS } from "../../i18n/dictionaries";
import { useLocale } from "../../i18n/locale-context";
import { SelectChip } from "../../ui/SelectChip";

const LANGUAGE_OPTIONS = LOCALES.map((locale) => ({ value: locale, label: SHELL_STRINGS[locale].language.name }));

export function LanguageSwitch() {
  const { locale, strings, setLocale } = useLocale();
  const choose = (value: string) => {
    if (isLocale(value)) setLocale(value);
  };

  return (
    <SelectChip
      ariaLabel={strings.language.label}
      value={locale}
      displayValue={strings.language.name}
      options={LANGUAGE_OPTIONS}
      onChange={choose}
      icon={<Languages aria-hidden className="size-4" />}
    />
  );
}
