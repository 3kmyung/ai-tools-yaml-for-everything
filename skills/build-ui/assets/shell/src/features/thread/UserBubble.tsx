import type { UserMessage } from "../../core/messages";
import type { Release } from "../../core/release";
import { requestTextOf, summarizeRequest } from "../../core/request-summary";
import { useLocale } from "../../i18n/locale-context";

interface UserBubbleProps {
  release: Release;
  message: UserMessage;
}

export function UserBubble({ release, message }: UserBubbleProps) {
  const { locale } = useLocale();
  const { request } = message;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="max-w-[85%] rounded-card bg-surface-muted px-4 py-2.5 text-body-lg leading-6 break-all whitespace-pre-wrap text-ink">
        {requestTextOf(release, request)}
      </div>
      <p className="max-w-[85%] truncate px-2 text-caption text-ink-tertiary">{summarizeRequest(release, request, locale)}</p>
    </div>
  );
}
