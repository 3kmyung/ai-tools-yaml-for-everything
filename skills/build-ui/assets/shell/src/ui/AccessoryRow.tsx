import type { ReactNode } from "react";
import { classNames } from "../lib/class-names";
import { FOCUS_RING, FOCUS_RING_WITHIN } from "./styles/focus-ring";
import { DASHED_SLOT } from "./styles/surface-classes";

export const ACCESSORY_ROW_CLASS = "flex h-10 items-center rounded-panel bg-surface-muted pr-1.5 pl-4";

const PLACEHOLDER_CLASS = classNames(DASHED_SLOT, "flex h-10 min-w-0 flex-1 items-center gap-2 px-4 text-left");

interface AccessoryRowProps {
  icon: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export function AccessoryRow({ icon, children, trailing, className }: AccessoryRowProps) {
  return (
    <div className={classNames(ACCESSORY_ROW_CLASS, "gap-2", className)}>
      {icon}
      {children}
      {trailing}
    </div>
  );
}

interface AccessoryPlaceholderProps {
  icon: ReactNode;
  label: string;
  hint: string;
  onClick?: () => void;
  input?: ReactNode;
}

export function AccessoryPlaceholder({ icon, label, hint, onClick, input }: AccessoryPlaceholderProps) {
  const content = (
    <>
      {icon}
      <span className="shrink-0 text-label font-semibold text-ink">{label}</span>
      <span className="ml-auto truncate text-caption text-ink-tertiary">{hint}</span>
    </>
  );

  if (input) {
    return (
      <label className={classNames(PLACEHOLDER_CLASS, "cursor-pointer", FOCUS_RING_WITHIN)}>
        {content}
        {input}
      </label>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classNames(PLACEHOLDER_CLASS, FOCUS_RING)}>
      {content}
    </button>
  );
}
