import { mainPromptFor, optionFieldsFor, promptsFor, textOf, type Draft } from "./draft";
import { pickLocalized, type Locale } from "./locale";
import type { RunRequest, Thread } from "./messages";
import type { ReleaseDefinition } from "./release";

export type SummaryShape = Pick<ReleaseDefinition<unknown>, "workflows" | "prompts" | "options">;

const TITLE_LENGTH = 28;

function shorten(text: string): string {
  const singleLine = text.trim().replace(/\s+/g, " ");
  const characters = [...singleLine];
  if (characters.length <= TITLE_LENGTH) return singleLine;
  return `${characters.slice(0, TITLE_LENGTH).join("")}…`;
}

function fileNamesOf(request: RunRequest): string {
  return Object.values(request.files)
    .map((file) => file.name)
    .join(" · ");
}

function mainTextOf(shape: Pick<SummaryShape, "prompts">, request: RunRequest): string {
  const prompt = mainPromptFor(shape, request.workflowId);
  return prompt ? (request.texts[prompt.field] ?? "") : "";
}

function leadTextsOf(shape: Pick<SummaryShape, "prompts">, request: RunRequest): string[] {
  return promptsFor(shape, request.workflowId)
    .slice(0, -1)
    .map((prompt) => (request.texts[prompt.field] ?? "").trim())
    .filter((text) => text !== "")
    .map(shorten);
}

function leadsWithFiles(shape: Pick<SummaryShape, "prompts">, request: RunRequest): boolean {
  return mainPromptFor(shape, request.workflowId)?.optional === true && Object.keys(request.files).length > 0;
}

export function workflowLabelOf(shape: Pick<SummaryShape, "workflows">, workflowId: string, locale: Locale): string {
  const workflow = shape.workflows.find((candidate) => candidate.id === workflowId);
  return workflow ? pickLocalized(workflow.label, locale) : workflowId;
}

export function requestTextOf(shape: Pick<SummaryShape, "prompts">, request: RunRequest): string {
  const text = mainTextOf(shape, request);
  if (!leadsWithFiles(shape, request) && text.trim() !== "") return text;
  return fileNamesOf(request);
}

export function summarizeRequest(shape: SummaryShape, request: RunRequest, locale: Locale): string {
  const optionLabels = optionFieldsFor(shape, request.workflowId).map((option) => {
    const value = request.options[option.field] ?? option.defaultValue;
    const choice = option.choices.find((candidate) => candidate.value === value);
    return choice ? pickLocalized(choice.label, locale) : String(value);
  });
  const mainText = mainTextOf(shape, request);
  const secondaryText = leadsWithFiles(shape, request) && mainText.trim() !== "" ? [shorten(mainText)] : [];
  const parts = [workflowLabelOf(shape, request.workflowId, locale), ...optionLabels, ...leadTextsOf(shape, request), ...secondaryText];
  return parts.join(" · ");
}

export function deriveThreadTitle(shape: SummaryShape, draft: Draft): string | null {
  const prompt = mainPromptFor(shape, draft.workflowId);
  const text = textOf(draft, prompt);
  if (prompt && !prompt.optional && text !== "") return shorten(text);
  const firstFile = Object.values(draft.files).find((file): file is File => file !== null);
  if (firstFile) return shorten(firstFile.name);
  return text !== "" ? shorten(text) : null;
}

export interface TitledThread extends Omit<Thread, "title"> {
  title: string;
}

export function titleThread(shape: Pick<SummaryShape, "workflows">, thread: Thread, locale: Locale): TitledThread {
  return { ...thread, title: thread.title ?? workflowLabelOf(shape, thread.workflowId, locale) };
}
