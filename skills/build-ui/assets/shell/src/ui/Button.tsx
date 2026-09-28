import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "../lib/class-names";
import { DISABLED_STATE, FOCUS_RING } from "./styles/focus-ring";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "md" | "sm";

const SIZE_CLASSES: Readonly<Record<ButtonSize, string>> = {
  md: "h-10 px-5 text-body font-semibold",
  sm: "h-8 px-2 text-label font-medium",
};

const VARIANT_CLASSES: Readonly<Record<ButtonVariant, string>> = {
  primary: "bg-inverse text-on-inverse not-disabled:hover:opacity-85",
  secondary: "bg-surface-muted text-ink not-disabled:hover:bg-surface-hover",
  danger: "bg-danger text-white not-disabled:hover:opacity-90",
  ghost: "text-ink-secondary not-disabled:hover:bg-surface-hover not-disabled:hover:text-ink",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({ variant = "secondary", size = "md", children, className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={classNames(
        "inline-flex items-center justify-center gap-2 rounded-full transition",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        FOCUS_RING,
        DISABLED_STATE,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
