import type { InputValue } from "../../core/messages";
import type { OptionField } from "../../core/release";
import { useLocale } from "../../i18n/locale-context";
import { SelectChip } from "../../ui/SelectChip";

interface OptionChipsProps {
  options: readonly OptionField[];
  values: Readonly<Record<string, InputValue>>;
  onChange: (field: string, value: InputValue) => void;
}

function OptionChip({ option, value, onChange }: { option: OptionField; value: InputValue; onChange: (field: string, value: InputValue) => void }) {
  const { pick } = useLocale();
  const Icon = option.icon;
  const selectedIndex = Math.max(0, option.choices.findIndex((choice) => choice.value === value));
  const selectedChoice = option.choices[selectedIndex];
  const selectOptions = option.choices.map((choice, index) => ({
    value: String(index),
    label: pick(choice.label),
    description: choice.description && pick(choice.description),
  }));
  const choose = (indexText: string) => {
    const choice = option.choices[Number(indexText)];
    if (choice) onChange(option.field, choice.value);
  };

  return (
    <SelectChip
      ariaLabel={pick(option.label)}
      value={String(selectedIndex)}
      displayValue={selectedChoice ? pick(selectedChoice.label) : String(value)}
      options={selectOptions}
      onChange={choose}
      icon={<Icon aria-hidden className="size-3.5" />}
    />
  );
}

export function OptionChips({ options, values, onChange }: OptionChipsProps) {
  return options.map((option) => (
    <OptionChip key={option.field} option={option} value={values[option.field] ?? option.defaultValue} onChange={onChange} />
  ));
}
