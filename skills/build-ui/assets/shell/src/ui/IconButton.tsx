import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "../lib/class-names";
import { iconButtonClasses, type IconButtonSize, type IconButtonVariant } from "./styles/icon-button-classes";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tooltip?: string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  children: ReactNode;
}

export function IconButton({ label, tooltip, size, variant, children, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={tooltip ?? label}
      className={classNames(iconButtonClasses({ size, variant }), className)}
      {...rest}
    >
      {children}
    </button>
  );
}
