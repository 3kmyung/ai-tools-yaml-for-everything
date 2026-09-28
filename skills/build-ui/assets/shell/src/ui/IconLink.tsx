import type { AnchorHTMLAttributes, ReactNode } from "react";
import { classNames } from "../lib/class-names";
import { iconButtonClasses, type IconButtonSize, type IconButtonVariant } from "./styles/icon-button-classes";

interface IconLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  label: string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  children: ReactNode;
}

export function IconLink({ label, size, variant, children, className, ...rest }: IconLinkProps) {
  return (
    <a aria-label={label} title={label} className={classNames(iconButtonClasses({ size, variant }), className)} {...rest}>
      {children}
    </a>
  );
}
