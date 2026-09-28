import { Check } from "lucide-react";
import { classNames } from "../../lib/class-names";
import type { SelectOption } from "./select-options";

interface SelectOptionRowProps {
  id: string;
  option: SelectOption;
  isSelected: boolean;
  isActive: boolean;
  onChoose: () => void;
  onHover: () => void;
}

export function SelectOptionRow({ id, option, isSelected, isActive, onChoose, onHover }: SelectOptionRowProps) {
  const isDisabled = option.disabled === true;
  return (
    <li
      id={id}
      role="option"
      aria-selected={isSelected}
      aria-disabled={isDisabled || undefined}
      onClick={isDisabled ? undefined : onChoose}
      onMouseMove={isDisabled ? undefined : onHover}
      className={classNames(
        "flex items-start gap-2 rounded-row py-2 pr-5 pl-3 text-left",
        isActive && !isDisabled && "bg-surface-hover",
        isDisabled ? "cursor-default opacity-40" : "cursor-pointer",
      )}
    >
      <Check aria-hidden className={classNames("mt-0.5 size-4 shrink-0 text-ink-tertiary", !isSelected && "invisible")} strokeWidth={2.4} />
      <span className="flex min-w-0 flex-col">
        <span className="text-body leading-5 font-medium text-ink">{option.label}</span>
        {option.description && <span className="text-caption leading-4 text-ink-tertiary">{option.description}</span>}
      </span>
    </li>
  );
}
