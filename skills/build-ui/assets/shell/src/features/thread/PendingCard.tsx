import type { PendingRun } from "../../core/conversation";
import type { Release } from "../../core/release";
import { showsSteps } from "../../core/run-steps";
import { useLocale } from "../../i18n/locale-context";
import { formatClock } from "../../lib/format-time";
import { Card } from "../../ui/Card";
import { DotGrid } from "../../ui/dot-grid/DotGrid";
import { useElapsedSeconds } from "../../ui/use-elapsed-seconds";
import { RunSteps } from "./RunSteps";

interface PendingCardProps {
  release: Release;
  pending: PendingRun;
}

export function PendingCard({ release, pending }: PendingCardProps) {
  const { strings } = useLocale();
  const elapsedSeconds = useElapsedSeconds(pending.startedAt);
  const steps = release.workflows.find((workflow) => workflow.id === pending.workflowId)?.steps;

  return (
    <Card data-reply="pending" aria-live="polite" aria-busy>
      <DotGrid state="waiting" className="h-18" />
      {showsSteps(steps) && (
        <div className="mt-4">
          <RunSteps steps={steps} states={pending.steps} />
        </div>
      )}
      <p className="mt-3 flex items-center justify-end gap-3 text-caption text-ink-tertiary">
        <span className="shrink-0 tabular-nums">
          {pending.isStopping ? strings.thread.stopping : strings.thread.running} · {formatClock(elapsedSeconds)}
        </span>
      </p>
    </Card>
  );
}
