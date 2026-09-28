import { useState, type KeyboardEvent } from "react";
import { useLocale } from "../../i18n/locale-context";

interface ThreadTitleInputProps {
  initialTitle: string;
  onDone: (title: string | null) => void;
}

export function ThreadTitleInput({ initialTitle, onDone }: ThreadTitleInputProps) {
  const { strings } = useLocale();
  const [title, setTitle] = useState(initialTitle);

  const commit = () => {
    const trimmed = title.trim();
    onDone(trimmed === "" || trimmed === initialTitle ? null : trimmed);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") commit();
    if (event.key === "Escape") onDone(null);
  };

  return (
    <input
      autoFocus
      value={title}
      aria-label={strings.sidebar.threadName}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      className="w-full rounded-row bg-surface px-3 py-2 text-body text-ink outline-2 outline-accent"
    />
  );
}
