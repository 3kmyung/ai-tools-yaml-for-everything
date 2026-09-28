import type { Localized } from "./locale";
import type { InputValue, RunRequest, StoredFile } from "./messages";
import type { FileSlot, OptionField, PromptField, ReleaseDefinition, ScopedField } from "./release";

export interface Draft {
  workflowId: string;
  texts: Readonly<Record<string, string>>;
  files: Readonly<Record<string, File | null>>;
  options: Readonly<Record<string, InputValue>>;
}

export type DraftShape = Pick<ReleaseDefinition<unknown>, "workflows" | "prompts" | "files" | "options" | "findBlockedReason">;

export type BlockedReason = { kind: "recording" } | { kind: "missing"; message: Localized };

export function appliesTo(field: ScopedField, workflowId: string): boolean {
  return field.workflows === undefined || field.workflows.includes(workflowId);
}

export function promptsFor(shape: Pick<DraftShape, "prompts">, workflowId: string): PromptField[] {
  return (shape.prompts ?? []).filter((prompt) => appliesTo(prompt, workflowId));
}

export function mainPromptFor(shape: Pick<DraftShape, "prompts">, workflowId: string): PromptField | null {
  return promptsFor(shape, workflowId).at(-1) ?? null;
}

export function fileSlotsFor(shape: Pick<DraftShape, "files">, workflowId: string): FileSlot[] {
  return (shape.files ?? []).filter((slot) => appliesTo(slot, workflowId));
}

export function optionFieldsFor(shape: Pick<DraftShape, "options">, workflowId: string): OptionField[] {
  return (shape.options ?? []).filter((option) => appliesTo(option, workflowId));
}

export function textOf(draft: Draft, prompt: PromptField | null): string {
  return prompt ? (draft.texts[prompt.field] ?? "").trim() : "";
}

export function createDraft(shape: Pick<DraftShape, "workflows" | "options">): Draft {
  const options = Object.fromEntries((shape.options ?? []).map((option) => [option.field, option.defaultValue]));
  return { workflowId: shape.workflows[0]?.id ?? "", texts: {}, files: {}, options };
}

export function clearSentDraft(draft: Draft): Draft {
  return { ...draft, texts: {}, files: {} };
}

export function buildRunRequest(shape: DraftShape, draft: Draft, files: Readonly<Record<string, StoredFile>>): RunRequest {
  const options = Object.fromEntries(
    optionFieldsFor(shape, draft.workflowId).map((option) => [option.field, draft.options[option.field] ?? option.defaultValue]),
  );
  const texts = Object.fromEntries(promptsFor(shape, draft.workflowId).map((prompt) => [prompt.field, textOf(draft, prompt)]));
  return { workflowId: draft.workflowId, texts, files, options };
}

function missing(message: Localized | null | undefined): BlockedReason | null {
  return message ? { kind: "missing", message } : null;
}

export function findBlockedReason(shape: DraftShape, draft: Draft, isRecording: boolean): BlockedReason | null {
  if (isRecording) return { kind: "recording" };

  const emptyPrompt = promptsFor(shape, draft.workflowId).find((prompt) => !prompt.optional && textOf(draft, prompt) === "");

  if (emptyPrompt && !emptyPrompt.optional) return missing(emptyPrompt.missing);

  const missingFile = fileSlotsFor(shape, draft.workflowId).find((slot) => !draft.files[slot.field]);

  if (missingFile) return missing(missingFile.missing);

  return missing(shape.findBlockedReason?.(draft));
}
