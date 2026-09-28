import { classNames } from "../../lib/class-names";
import { DISABLED_STATE, FOCUS_RING } from "./focus-ring";

export type IconButtonSize = "sm" | "md" | "lg";
export type IconButtonVariant = "ghost" | "quiet" | "solid" | "muted";

const SIZE_CLASSES: Readonly<Record<IconButtonSize, string>> = {
  sm: "size-7",
  md: "h-9 min-w-9",
  lg: "size-11",
};

const VARIANT_CLASSES: Readonly<Record<IconButtonVariant, string>> = {
  ghost: "text-ink-secondary not-disabled:hover:bg-surface-hover not-disabled:hover:text-ink",
  quiet: "text-ink-tertiary not-disabled:hover:bg-surface-hover not-disabled:hover:text-ink",
  solid: "bg-inverse text-on-inverse not-disabled:hover:opacity-85",
  muted: "bg-surface-muted text-ink-tertiary",
};

function defaultVariantFor(size: IconButtonSize): IconButtonVariant {
  return size === "sm" ? "quiet" : "ghost";
}

function disabledClasses(variant: IconButtonVariant): string {
  return variant === "muted" ? "" : DISABLED_STATE;
}

interface IconButtonShape {
  size?: IconButtonSize;
  variant?: IconButtonVariant;
}

export function iconButtonClasses({ size = "md", variant }: IconButtonShape): string {
  const chosen = variant ?? defaultVariantFor(size);
  return classNames(
    "inline-flex shrink-0 items-center justify-center rounded-full transition",
    SIZE_CLASSES[size],
    VARIANT_CLASSES[chosen],
    FOCUS_RING,
    disabledClasses(chosen),
  );
}
