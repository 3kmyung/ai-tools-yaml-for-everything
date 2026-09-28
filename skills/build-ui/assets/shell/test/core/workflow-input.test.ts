import { describe, expect, it } from "vitest";
import { buildWorkflowInput } from "../../src/core/workflow-input";
import { OPTIONAL_PROMPT_SHAPE, requestOf, SHAPE, TWO_PROMPT_SHAPE } from "./shell-fixture";

const UPLOAD = { __variable__: { type: "stream", id: "stream-1" } };

describe("buildWorkflowInput", () => {
  it("puts the prompt, options and uploads under their field names", () => {
    const input = buildWorkflowInput(SHAPE, requestOf({ texts: { text: "본문" }, options: { level: "high" } }), {});
    expect(input).toEqual({ text: "본문", level: "high" });
  });

  it("sends each file as the upload made for its field", () => {
    const input = buildWorkflowInput(SHAPE, requestOf({ workflowId: "beta", options: { mode: 1 } }), { source: UPLOAD });
    expect(input).toEqual({ source: UPLOAD, mode: 1, level: "low" });
  });

  it("sends a required prompt even when empty and leaves out an empty optional one", () => {
    expect(buildWorkflowInput(SHAPE, requestOf({}), {})).toEqual({ text: "", level: "low" });
    expect(buildWorkflowInput(OPTIONAL_PROMPT_SHAPE, requestOf({ workflowId: "beta" }), { source: UPLOAD })).toEqual({ source: UPLOAD, mode: 2, level: "low" });
    expect(buildWorkflowInput(OPTIONAL_PROMPT_SHAPE, requestOf({ workflowId: "beta", texts: { note: "메모" } }), { source: UPLOAD })).toEqual({
      note: "메모",
      source: UPLOAD,
      mode: 2,
      level: "low",
    });
  });

  it("sends every prompt under its own field name", () => {
    const request = requestOf({ texts: { style: "잔잔한 피아노", text: "본문" } });
    expect(buildWorkflowInput(TWO_PROMPT_SHAPE, request, {})).toEqual({ style: "잔잔한 피아노", text: "본문", level: "low" });
  });

  it("lets the release reshape the input", () => {
    const shape = { ...SHAPE, buildInput: (input: Record<string, unknown>) => ({ nested: input }) };
    expect(buildWorkflowInput(shape, requestOf({ workflowId: "beta" }), { source: UPLOAD })).toEqual({ nested: { source: UPLOAD, mode: 2, level: "low" } });
  });
});
