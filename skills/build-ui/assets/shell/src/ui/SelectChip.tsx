import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { classNames } from "../lib/class-names";
import type { SelectControlProps } from "./select/select-options";
import { SelectPanel } from "./select/SelectPanel";
import { selectTriggerProps } from "./select/select-trigger";
import { useSelect } from "./select/use-select";
import { chipClasses } from "./styles/chip-classes";

interface SelectChipProps extends SelectControlProps {
  icon?: ReactNode;
  disabled?: boolean;
  hideLabelOnMobile?: boolean;
  className?: string;
}

const CHIP_CLASS = chipClasses({});

export function SelectChip({ ariaLabel, value, displayValue, options, onChange, icon, disabled, hideLabelOnMobile, className }: SelectChipProps) {
  const select = useSelect({ options, value, onChange });
  return (
    <>
      <button {...selectTriggerProps(select, `${ariaLabel}: ${displayValue}`)} disabled={disabled} className={classNames(CHIP_CLASS, className)}>
        {icon}
        <span className={classNames("truncate", hideLabelOnMobile && "sr-only sm:not-sr-only")}>{displayValue}</span>
        <ChevronDown aria-hidden className="size-3.5 opacity-60" />
      </button>
      <SelectPanel select={select} options={options} value={value} ariaLabel={ariaLabel} />
    </>
  );
}
