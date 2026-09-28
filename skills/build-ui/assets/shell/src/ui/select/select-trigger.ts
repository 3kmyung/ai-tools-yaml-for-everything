import type { ButtonHTMLAttributes, RefObject } from "react";
import type { SelectControls } from "./use-select";

type TriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & { ref: RefObject<HTMLButtonElement | null> };

export function selectTriggerProps(select: SelectControls, label: string): TriggerProps {
  return {
    ref: select.triggerRef,
    type: "button",
    "aria-label": label,
    "aria-haspopup": "listbox",
    "aria-expanded": select.isOpen,
    "aria-controls": select.panelId,
    popoverTarget: select.panelId,
    onKeyDown: select.onTriggerKeyDown,
  };
}
