import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "../lib/class-names";
import { chipClasses, type ChipSize, type ChipVariant } from "./styles/chip-classes";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  size?: ChipSize;
  variant?: ChipVariant;
  icon?: ReactNode;
  children: ReactNode;
}

export function Chip({ isActive, size, variant, icon, children, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={isActive}
      className={classNames(chipClasses({ size, variant, isActive }), className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
