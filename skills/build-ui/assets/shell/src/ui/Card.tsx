import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "../lib/class-names";
import { CARD_SECTION, surfaceClasses } from "./styles/surface-classes";

interface CardProps extends HTMLAttributes<HTMLElement> {
  header?: ReactNode;
  footer?: ReactNode;
  closing?: ReactNode;
  children: ReactNode;
}

export function Card({ header, footer, closing, children, className, ...rest }: CardProps) {
  return (
    <article className={classNames(surfaceClasses({}), "p-4 sm:p-5", className)} {...rest}>
      {header && <header className="mb-4">{header}</header>}
      {children}
      {footer && <footer className={CARD_SECTION}>{footer}</footer>}
      {closing}
    </article>
  );
}
