import { classNames } from "../../lib/class-names";
import { DISABLED_STATE, FOCUS_RING } from "./focus-ring";

export type ChipSize = "md" | "sm";
export type ChipVariant = "plain" | "outline" | "filled";

const SIZE_CLASSES: Readonly<Record<ChipSize, string>> = {
  md: "h-8 px-3 text-label",
  sm: "h-7 px-2.5 text-caption",
};

const VARIANT_CLASSES: Readonly<Record<ChipVariant, string>> = {
  plain: "text-ink-secondary not-disabled:hover:bg-surface-hover not-disabled:hover:text-ink aria-expanded:bg-surface-hover aria-expanded:text-ink",
  outline: "border border-hairline text-ink-secondary not-disabled:hover:bg-surface-hover not-disabled:hover:text-ink",
  filled: "bg-surface-muted text-ink not-disabled:hover:bg-surface-hover",
};

const ACTIVE_CLASSES = "bg-inverse text-on-inverse";

interface ChipShape {
  size?: ChipSize;
  variant?: ChipVariant;
  isActive?: boolean;
}

export function chipClasses({ size = "md", variant = "plain", isActive = false }: ChipShape): string {
  return classNames(
    "inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium transition-colors",
    SIZE_CLASSES[size],
    isActive ? ACTIVE_CLASSES : VARIANT_CLASSES[variant],
    FOCUS_RING,
    DISABLED_STATE,
  );
}
