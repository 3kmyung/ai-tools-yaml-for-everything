import { describe, expect, it } from "vitest";
import { deriveThreadTitle, requestTextOf, summarizeRequest, titleThread } from "../../src/core/request-summary";
import { draftOf, OPTIONAL_PROMPT_SHAPE, requestOf, SHAPE, TWO_PROMPT_SHAPE } from "./shell-fixture";

const STORED = { blobId: "b1", name: "sample.bin", type: "application/octet-stream", size: 10 };
const SAMPLE = new File(["BIN"], "sample.bin", { type: "application/octet-stream" });

describe("requestTextOf", () => {
  it("shows the prompt, or the file names when there is none", () => {
    expect(requestTextOf(SHAPE, requestOf({ texts: { text: "본문" } }))).toBe("본문");
    expect(requestTextOf(SHAPE, requestOf({ workflowId: "beta", files: { source: STORED } }))).toBe("sample.bin");
  });

  it("shows the file names ahead of an optional prompt", () => {
    expect(requestTextOf(OPTIONAL_PROMPT_SHAPE, requestOf({ workflowId: "beta", texts: { note: "메모" }, files: { source: STORED } }))).toBe("sample.bin");
    expect(requestTextOf(OPTIONAL_PROMPT_SHAPE, requestOf({ workflowId: "beta", texts: { note: "메모" } }))).toBe("메모");
  });

  it("shows the main prompt when there are two, leaving the one in front to the summary", () => {
    const request = requestOf({ texts: { style: "잔잔한 피아노", text: "본문" } });
    expect(requestTextOf(TWO_PROMPT_SHAPE, request)).toBe("본문");
  });
});

describe("summarizeRequest", () => {
  it("names the workflow and the chosen option labels in the view's locale", () => {
    const request = requestOf({ workflowId: "beta", options: { mode: 1, level: "high" } });
    expect(summarizeRequest(SHAPE, request, "en")).toBe("Beta · First · High");
    expect(summarizeRequest(SHAPE, request, "ko")).toBe("베타 · 첫째 · 높음");
    expect(summarizeRequest(SHAPE, request, "zh")).toBe("贝塔 · 第一 · 高");
  });

  it("falls back to a default the request did not store", () => {
    expect(summarizeRequest(SHAPE, requestOf({ workflowId: "beta" }), "en")).toBe("Beta · Second · Low");
  });

  it("adds a filled optional prompt after the options when the files lead", () => {
    const withText = requestOf({ workflowId: "beta", texts: { note: "메모" }, files: { source: STORED } });
    const withoutText = requestOf({ workflowId: "beta", files: { source: STORED } });
    expect(summarizeRequest(OPTIONAL_PROMPT_SHAPE, withText, "en")).toBe("Beta · Second · Low · 메모");
    expect(summarizeRequest(OPTIONAL_PROMPT_SHAPE, withoutText, "en")).toBe("Beta · Second · Low");
  });

  it("carries the prompt in front of the main one so the bubble says what was sent", () => {
    const request = requestOf({ texts: { style: "잔잔한 피아노", text: "본문" } });
    expect(summarizeRequest(TWO_PROMPT_SHAPE, request, "en")).toBe("Alpha · Low · 잔잔한 피아노");
  });
});

describe("deriveThreadTitle", () => {
  it("uses the prompt on one line, shortened", () => {
    expect(deriveThreadTitle(SHAPE, draftOf({ texts: { text: "  안녕하세요\n반갑습니다 " } }))).toBe("안녕하세요 반갑습니다");
    expect(deriveThreadTitle(SHAPE, draftOf({ texts: { text: "가".repeat(40) } }))).toBe(`${"가".repeat(28)}…`);
  });

  it("uses the first file, then leaves the title to the workflow label", () => {
    expect(deriveThreadTitle(SHAPE, draftOf({ workflowId: "beta", files: { source: SAMPLE } }))).toBe("sample.bin");
    expect(deriveThreadTitle(SHAPE, draftOf({ workflowId: "beta" }))).toBeNull();
  });

  it("prefers the file to an optional prompt", () => {
    expect(deriveThreadTitle(OPTIONAL_PROMPT_SHAPE, draftOf({ workflowId: "beta", texts: { note: "메모" }, files: { source: SAMPLE } }))).toBe("sample.bin");
    expect(deriveThreadTitle(OPTIONAL_PROMPT_SHAPE, draftOf({ workflowId: "beta", texts: { note: " 메모 " } }))).toBe("메모");
    expect(deriveThreadTitle(OPTIONAL_PROMPT_SHAPE, draftOf({ workflowId: "beta" }))).toBeNull();
  });
});

describe("titleThread", () => {
  it("keeps a stored title and names an untitled thread after its workflow in the current locale", () => {
    const untitled = { id: "t", title: null, workflowId: "beta", createdAt: 1, updatedAt: 1 };
    expect(titleThread(SHAPE, { ...untitled, title: "sample.bin" }, "ko").title).toBe("sample.bin");
    expect([titleThread(SHAPE, untitled, "en").title, titleThread(SHAPE, untitled, "ko").title]).toEqual(["Beta", "베타"]);
  });
});
