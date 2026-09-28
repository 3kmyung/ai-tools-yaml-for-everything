import { Check, X } from "lucide-react";
import type { StepLabel } from "../../core/release";
import { listSteps, type StepState, type StepStates } from "../../core/run-steps";
import { useLocale } from "../../i18n/locale-context";
import { classNames } from "../../lib/class-names";

const STEP_TONE: Readonly<Record<StepState, string>> = {
  done: "text-ink-secondary",
  active: "font-semibold text-ink",
  todo: "text-ink-tertiary",
  failed: "text-danger",
};

function StepMark({ state }: { state: StepState }) {
  if (state === "done") return <Check aria-hidden className="size-3.5" strokeWidth={3} />;
  if (state === "failed") return <X aria-hidden className="size-3.5" strokeWidth={3} />;
  if (state === "active") return <span aria-hidden className="size-2 animate-pulse rounded-full bg-ink" />;
  return <span aria-hidden className="size-2 rounded-full border border-ink-tertiary" />;
}

export function RunSteps({ steps, states }: { steps: readonly StepLabel[]; states: StepStates }) {
  const { strings, pick } = useLocale();
  return (
    <ol aria-label={strings.thread.steps} className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {listSteps(steps, states).map((step) => (
        <li
          key={step.job}
          aria-current={step.state === "active" ? "step" : undefined}
          className={classNames("flex items-center gap-1.5 text-label", STEP_TONE[step.state])}
        >
          <span className="inline-flex size-3.5 items-center justify-center">
            <StepMark state={step.state} />
          </span>
          {pick(step.label)}
        </li>
      ))}
    </ol>
  );
}
