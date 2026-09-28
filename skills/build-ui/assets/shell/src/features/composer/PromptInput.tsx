import type { KeyboardEvent } from "react";
import { classNames } from "../../lib/class-names";
import { FIELD_RULE } from "../../ui/styles/surface-classes";

interface PromptInputProps {
  field: string;
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

const COMPOSING_KEY_CODE = 229;

function isSendKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  if (event.key !== "Enter" || event.shiftKey) return false;
  return !event.nativeEvent.isComposing && event.keyCode !== COMPOSING_KEY_CODE;
}

export function PromptInput({ field, value, placeholder, autoFocus, onChange, onSubmit }: PromptInputProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isSendKey(event)) return;
    event.preventDefault();
    onSubmit();
  };

  return (
    <textarea
      data-prompt={field}
      rows={1}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={placeholder}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      className="auto-grow block max-h-52 min-h-12 w-full resize-none bg-transparent px-5 pt-4 pb-2 text-input leading-6 text-ink outline-none placeholder:text-ink-tertiary"
    />
  );
}

export function LeadPromptInput({ field, value, placeholder, autoFocus, onChange, onSubmit }: PromptInputProps) {
  return (
    <input
      data-prompt={field}
      type="text"
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={placeholder}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        onSubmit();
      }}
      className={classNames(FIELD_RULE, "block w-full bg-transparent px-5 pt-3.5 pb-2.5 text-input leading-6 text-ink outline-none placeholder:text-ink-tertiary")}
    />
  );
}
