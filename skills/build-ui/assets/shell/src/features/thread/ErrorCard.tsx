import { CircleAlert, CircleStop, RotateCcw } from "lucide-react";
import { describeFailure } from "../../core/failure-copy";
import type { FailureRule } from "../../core/release";
import { useLocale } from "../../i18n/locale-context";
import { Card } from "../../ui/Card";
import { Chip } from "../../ui/Chip";

interface ErrorCardProps {
  reason: string;
  detail: string;
  rules: readonly FailureRule[] | undefined;
  canRetry: boolean;
  onRetry: () => void;
}

export function ErrorCard({ reason, detail, rules, canRetry, onRetry }: ErrorCardProps) {
  const { locale, strings } = useLocale();
  const { title, hint } = describeFailure(reason, locale, rules);
  const isCancelled = reason === "cancelled";
  const Icon = isCancelled ? CircleStop : CircleAlert;

  return (
    <Card role="status" data-reply={isCancelled ? "cancelled" : "error"} className="flex items-start gap-3">
      <Icon aria-hidden className={isCancelled ? "mt-0.5 size-5 shrink-0 text-ink-tertiary" : "mt-0.5 size-5 shrink-0 text-danger"} />
      <div className="min-w-0 flex-1">
        <p data-failure-title className="text-body font-semibold text-ink">{title}</p>
        <p data-failure-hint className="mt-0.5 text-label text-ink-secondary">{hint}</p>
        {detail && <p className="mt-2 line-clamp-3 font-mono text-caption break-all text-ink-tertiary">{detail}</p>}
      </div>
      <Chip variant="filled" onClick={onRetry} disabled={!canRetry} icon={<RotateCcw aria-hidden className="size-3.5" />}>
        {strings.thread.retry}
      </Chip>
    </Card>
  );
}
