import { classNames } from "../../lib/class-names";
import { surfaceClasses } from "../styles/surface-classes";
import type { SelectOption } from "./select-options";
import { SelectOptionRow } from "./SelectOptionRow";
import type { SelectControls } from "./use-select";

interface SelectPanelProps {
  select: SelectControls;
  options: readonly SelectOption[];
  value: string;
  ariaLabel: string;
}

const PANEL_CLASS = classNames(
  "inset-auto m-0 top-[var(--select-top)] left-[var(--select-left)]",
  "min-w-[max(var(--select-min-width),12rem)] max-w-[calc(100vw-32px)]",
  surfaceClasses({ radius: "panel", elevation: "float" }),
  "p-0",
  "opacity-0 transition-opacity duration-100 data-[placed]:opacity-100",
);

export function SelectPanel({ select, options, value, ariaLabel }: SelectPanelProps) {
  const activeId = select.isOpen && select.activeIndex >= 0 ? select.optionId(select.activeIndex) : undefined;
  return (
    <div ref={select.panelRef} id={select.panelId} popover="auto" onToggle={select.onPanelToggle} className={PANEL_CLASS}>
      <ul
        ref={select.listRef}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={activeId}
        tabIndex={-1}
        onKeyDown={select.onListKeyDown}
        className="max-h-[var(--select-max-height)] overflow-y-auto p-2 outline-none"
      >
        {options.map((option, index) => (
          <SelectOptionRow
            key={option.value}
            id={select.optionId(index)}
            option={option}
            isSelected={option.value === value}
            isActive={index === select.activeIndex}
            onChoose={() => select.choose(index)}
            onHover={() => select.setActiveIndex(index)}
          />
        ))}
      </ul>
    </div>
  );
}
