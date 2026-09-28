import { fileSlotsFor, findBlockedReason, optionFieldsFor, promptsFor, type BlockedReason, type Draft } from "../../core/draft";
import type { Release } from "../../core/release";
import { useLocale, type LocaleControls } from "../../i18n/locale-context";
import { classNames } from "../../lib/class-names";
import { surfaceClasses } from "../../ui/styles/surface-classes";
import { FileAccessories } from "./FileAccessories";
import { OptionChips } from "./OptionChips";
import { LeadPromptInput, PromptInput } from "./PromptInput";
import { SendButton } from "./SendButton";
import type { DraftControls } from "./use-draft";
import { useRecorder } from "./use-recorder";
import { WorkflowPicker } from "./WorkflowPicker";

interface ComposerProps {
  release: Release;
  controls: DraftControls;
  isBusy: boolean;
  isStopping: boolean;
  onSubmit: (draft: Draft) => void;
  onStop: () => void;
}

function describeBlockedReason(reason: BlockedReason | null, { strings, pick }: LocaleControls): string | null {
  if (reason === null) return null;
  return reason.kind === "recording" ? strings.composer.recordingBlocksRun : pick(reason.message);
}

export function Composer({ release, controls, isBusy, isStopping, onSubmit, onStop }: ComposerProps) {
  const locale = useLocale();
  const { draft } = controls;
  const recorder = useRecorder(controls.setFile);
  const blockedReason = findBlockedReason(release, draft, recorder.status !== "idle");
  const prompts = promptsFor(release, draft.workflowId);
  const mainPrompt = prompts.at(-1) ?? null;
  const leadPrompts = prompts.slice(0, -1);
  const submit = () => {
    if (!isBusy && blockedReason === null) onSubmit(draft);
  };

  return (
    <form
      data-composer
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={classNames(surfaceClasses({ radius: "panel", elevation: "float" }), "w-full")}
    >
      <FileAccessories slots={fileSlotsFor(release, draft.workflowId)} files={draft.files} recorder={recorder} onChange={controls.setFile} />
      {leadPrompts.map((prompt) => (
        <LeadPromptInput
          key={prompt.field}
          field={prompt.field}
          value={draft.texts[prompt.field] ?? ""}
          placeholder={locale.pick(prompt.placeholder)}
          onChange={(value) => controls.setText(prompt.field, value)}
          onSubmit={submit}
        />
      ))}
      {mainPrompt && (
        <PromptInput
          field={mainPrompt.field}
          value={draft.texts[mainPrompt.field] ?? ""}
          placeholder={locale.pick(mainPrompt.placeholder)}
          autoFocus
          onChange={(value) => controls.setText(mainPrompt.field, value)}
          onSubmit={submit}
        />
      )}
      <div className={classNames("flex items-center gap-1 px-2.5 pb-2.5", !mainPrompt && "pt-2.5")}>
        {release.workflows.length >= 2 && (
          <WorkflowPicker workflows={release.workflows} workflowId={draft.workflowId} onChange={controls.selectWorkflow} />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          <OptionChips options={optionFieldsFor(release, draft.workflowId)} values={draft.options} onChange={controls.setOption} />
        </div>
        <SendButton isBusy={isBusy} isStopping={isStopping} blockedReason={describeBlockedReason(blockedReason, locale)} onStop={onStop} />
      </div>
    </form>
  );
}
