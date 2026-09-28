import { describe, expect, it } from "vitest";
import { buildRunRequest, clearSentDraft, createDraft, fileSlotsFor, findBlockedReason, mainPromptFor, optionFieldsFor, promptsFor } from "../../src/core/draft";
import { draftOf, OPTIONAL_PROMPT_SHAPE, SHAPE, SOURCE_MISSING, STYLE_MISSING, TEXT_MISSING, TWO_PROMPT_SHAPE } from "./shell-fixture";

const RELEASE_BLOCKED = { en: "The release blocked it", ko: "릴리스가 막았어요", zh: "被发布版本阻止" };

const SAMPLE = new File(["BIN"], "sample.bin", { type: "application/octet-stream" });

describe("createDraft", () => {
  it("starts on the first workflow with every option at its default", () => {
    expect(createDraft(SHAPE)).toEqual({ workflowId: "alpha", texts: {}, files: {}, options: { mode: 2, level: "low" } });
  });
});

describe("fields scoped to workflows", () => {
  it("offers a field only to the workflows it names, and an unscoped one to all", () => {
    expect(mainPromptFor(SHAPE, "alpha")?.field).toBe("text");
    expect(mainPromptFor(SHAPE, "beta")).toBeNull();
    expect(fileSlotsFor(SHAPE, "beta").map((slot) => slot.field)).toEqual(["source"]);
    expect(optionFieldsFor(SHAPE, "alpha").map((option) => option.field)).toEqual(["level"]);
    expect(optionFieldsFor(SHAPE, "beta").map((option) => option.field)).toEqual(["mode", "level"]);
  });
});

describe("two prompts", () => {
  it("treats the last prompt as the main one and keeps the rest in front of it", () => {
    expect(promptsFor(TWO_PROMPT_SHAPE, "alpha").map((prompt) => prompt.field)).toEqual(["style", "text"]);
    expect(mainPromptFor(TWO_PROMPT_SHAPE, "alpha")?.field).toBe("text");
  });

  it("waits for every required prompt, naming the first one still empty", () => {
    expect(findBlockedReason(TWO_PROMPT_SHAPE, draftOf({ texts: { text: "본문" } }), false)).toEqual({ kind: "missing", message: STYLE_MISSING });
    expect(findBlockedReason(TWO_PROMPT_SHAPE, draftOf({ texts: { style: "잔잔한 피아노" } }), false)).toEqual({ kind: "missing", message: TEXT_MISSING });
    expect(findBlockedReason(TWO_PROMPT_SHAPE, draftOf({ texts: { style: "잔잔한 피아노", text: "본문" } }), false)).toBeNull();
  });

  it("carries both prompts into the request", () => {
    const request = buildRunRequest(TWO_PROMPT_SHAPE, draftOf({ texts: { style: " 잔잔한 피아노 ", text: " 본문 " } }), {});
    expect(request.texts).toEqual({ style: "잔잔한 피아노", text: "본문" });
  });
});

describe("findBlockedReason", () => {
  it("names what is missing for the chosen workflow", () => {
    expect(findBlockedReason(SHAPE, draftOf({ texts: { text: "  " } }), false)).toEqual({ kind: "missing", message: TEXT_MISSING });
    expect(findBlockedReason(SHAPE, draftOf({ workflowId: "beta" }), false)).toEqual({ kind: "missing", message: SOURCE_MISSING });
  });

  it("lets a complete draft through", () => {
    expect(findBlockedReason(SHAPE, draftOf({ texts: { text: "본문" } }), false)).toBeNull();
    expect(findBlockedReason(SHAPE, draftOf({ workflowId: "beta", files: { source: SAMPLE } }), false)).toBeNull();
  });

  it("does not wait for an optional prompt", () => {
    expect(findBlockedReason(OPTIONAL_PROMPT_SHAPE, draftOf({ workflowId: "beta", files: { source: SAMPLE } }), false)).toBeNull();
    expect(findBlockedReason(OPTIONAL_PROMPT_SHAPE, draftOf({ workflowId: "beta", texts: { note: "메모" } }), false)).toEqual({ kind: "missing", message: SOURCE_MISSING });
  });

  it("holds a draft while a recording is still going", () => {
    expect(findBlockedReason(SHAPE, draftOf({ texts: { text: "본문" } }), true)).toEqual({ kind: "recording" });
  });

  it("asks the release last", () => {
    const shape = { ...SHAPE, findBlockedReason: () => RELEASE_BLOCKED };
    expect(findBlockedReason(shape, draftOf({ texts: { text: "" } }), false)).toEqual({ kind: "missing", message: TEXT_MISSING });
    expect(findBlockedReason(shape, draftOf({ texts: { text: "본문" } }), false)).toEqual({ kind: "missing", message: RELEASE_BLOCKED });
  });
});

describe("buildRunRequest", () => {
  it("keeps only what the chosen workflow reads", () => {
    const stored = { source: { blobId: "b1", name: "sample.bin", type: "application/octet-stream", size: 3 } };
    const sent = buildRunRequest(SHAPE, draftOf({ workflowId: "beta", texts: { text: "남은 글" }, options: { mode: 1, level: "high" } }), stored);
    const written = buildRunRequest(SHAPE, draftOf({ texts: { text: "본문" }, options: { mode: 1, level: "high" } }), {});
    expect(sent).toEqual({ workflowId: "beta", texts: {}, files: stored, options: { mode: 1, level: "high" } });
    expect(written).toEqual({ workflowId: "alpha", texts: { text: "본문" }, files: {}, options: { level: "high" } });
  });

  it("trims the prompt, optional or not", () => {
    expect(buildRunRequest(SHAPE, draftOf({ texts: { text: "  본문 \n" } }), {}).texts["text"]).toBe("본문");
    expect(buildRunRequest(OPTIONAL_PROMPT_SHAPE, draftOf({ workflowId: "beta", texts: { note: " 메모 " } }), {}).texts["note"]).toBe("메모");
  });
});

describe("clearSentDraft", () => {
  it("clears what was sent and keeps the workflow and options", () => {
    const cleared = clearSentDraft(draftOf({ workflowId: "beta", texts: { text: "글" }, files: { source: SAMPLE }, options: { level: "high" } }));
    expect(cleared).toEqual({ workflowId: "beta", texts: {}, files: {}, options: { level: "high" } });
  });
});
