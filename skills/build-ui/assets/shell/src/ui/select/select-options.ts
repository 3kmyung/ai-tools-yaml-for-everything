export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectControlProps {
  ariaLabel: string;
  value: string;
  displayValue: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
}

export type SelectEdge = "first" | "last";

export function stepEnabledIndex(options: readonly SelectOption[], from: number, step: 1 | -1): number {
  for (let index = from + step; index >= 0 && index < options.length; index += step) {
    if (!options[index]?.disabled) return index;
  }
  return from;
}

export function edgeEnabledIndex(options: readonly SelectOption[], edge: SelectEdge): number {
  const outside = edge === "first" ? -1 : options.length;
  const found = stepEnabledIndex(options, outside, edge === "first" ? 1 : -1);
  return found === outside ? -1 : found;
}

export function initialActiveIndex(options: readonly SelectOption[], value: string): number {
  const selected = options.findIndex((option) => option.value === value && !option.disabled);
  return selected >= 0 ? selected : edgeEnabledIndex(options, "first");
}
