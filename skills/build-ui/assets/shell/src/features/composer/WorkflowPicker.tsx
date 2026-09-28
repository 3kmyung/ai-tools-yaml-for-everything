import type { WorkflowChoice } from "../../core/release";
import { useLocale } from "../../i18n/locale-context";
import { SelectChip } from "../../ui/SelectChip";

interface WorkflowPickerProps {
  workflows: readonly WorkflowChoice[];
  workflowId: string;
  onChange: (workflowId: string) => void;
}

export function WorkflowPicker({ workflows, workflowId, onChange }: WorkflowPickerProps) {
  const { strings, pick } = useLocale();
  const selected = workflows.find((workflow) => workflow.id === workflowId) ?? workflows[0];
  if (!selected) return null;
  const Icon = selected.icon;
  const options = workflows.map((workflow) => ({ value: workflow.id, label: pick(workflow.label), description: pick(workflow.description) }));

  return (
    <SelectChip
      ariaLabel={strings.composer.workflowPicker}
      value={selected.id}
      displayValue={pick(selected.label)}
      options={options}
      onChange={onChange}
      icon={<Icon aria-hidden className="size-4" />}
      hideLabelOnMobile
      className="bg-surface-muted text-ink"
    />
  );
}
