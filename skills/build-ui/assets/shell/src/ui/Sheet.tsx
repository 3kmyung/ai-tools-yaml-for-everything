import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { classNames } from "../lib/class-names";
import { surfaceClasses } from "./styles/surface-classes";

interface SheetProps {
  isOpen: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

function useModalDialog(isOpen: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);
  return dialogRef;
}

function SheetBody({ title, description, children }: Pick<SheetProps, "title" | "description" | "children">) {
  return (
    <div className="p-7">
      <h2 className="font-display text-title-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-body text-ink-secondary">{description}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

export function Sheet({ isOpen, onClose, className, ...body }: SheetProps) {
  const dialogRef = useModalDialog(isOpen);
  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };
  const closeFromBrowser = () => {
    if (isOpen) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={closeFromBrowser}
      onClick={closeOnBackdrop}
      className={classNames(
        surfaceClasses({ radius: "card", elevation: "float" }),
        "m-auto max-h-[90dvh] w-[min(calc(100vw-32px),460px)] p-0",
        "backdrop:bg-scrim backdrop:backdrop-blur-sm",
        className,
      )}
    >
      {isOpen && <SheetBody {...body} />}
    </dialog>
  );
}
