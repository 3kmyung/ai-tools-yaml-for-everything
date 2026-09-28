import { fileSlotsFor, optionFieldsFor, promptsFor } from "./draft";
import type { RunRequest } from "./messages";
import type { ReleaseDefinition } from "./release";

export type InputShape = Pick<ReleaseDefinition<unknown>, "prompts" | "files" | "options" | "buildInput">;

export function buildWorkflowInput(
  shape: InputShape,
  request: RunRequest,
  uploads: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const prompt of promptsFor(shape, request.workflowId)) {
    const text = request.texts[prompt.field] ?? "";
    if (!prompt.optional || text !== "") input[prompt.field] = text;
  }
  for (const option of optionFieldsFor(shape, request.workflowId)) {
    input[option.field] = request.options[option.field] ?? option.defaultValue;
  }
  for (const slot of fileSlotsFor(shape, request.workflowId)) {
    input[slot.field] = uploads[slot.field];
  }
  return shape.buildInput ? shape.buildInput(input, request) : input;
}
