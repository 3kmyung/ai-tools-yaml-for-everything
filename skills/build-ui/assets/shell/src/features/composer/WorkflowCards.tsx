import type { WorkflowChoice } from "../../core/release";
import { useLocale } from "../../i18n/locale-context";
import { classNames } from "../../lib/class-names";
import { DISABLED_STATE, FOCUS_RING } from "../../ui/styles/focus-ring";

interface WorkflowCardsProps {
  workflows: readonly WorkflowChoice[];
  selectedId: string;
  onSelect: (workflowId: string) => void;
  className?: string;
}

function WorkflowCard({ workflow, isSelected, onSelect }: { workflow: WorkflowChoice; isSelected: boolean; onSelect: (workflowId: string) => void }) {
  const { pick } = useLocale();
  const Icon = workflow.icon;
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(workflow.id)}
      className={classNames(
        "flex h-full w-full flex-col items-start gap-1.5 rounded-panel border p-4 text-left transition-colors",
        FOCUS_RING,
        DISABLED_STATE,
        isSelected ? "border-inverse bg-inverse text-on-inverse" : "border-ink/80 text-ink not-disabled:hover:bg-surface-hover",
      )}
    >
      <Icon aria-hidden className="mb-1 size-5" />
      <span className="text-body-lg font-bold">{pick(workflow.label)}</span>
      <span className="text-label leading-5 opacity-70">{pick(workflow.description)}</span>
    </button>
  );
}

export function WorkflowCards({ workflows, selectedId, onSelect, className }: WorkflowCardsProps) {
  return (
    <ul className={classNames("grid grid-cols-2 gap-2", className)}>
      {workflows.map((workflow) => (
        <li key={workflow.id}>
          <WorkflowCard workflow={workflow} isSelected={workflow.id === selectedId} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}
