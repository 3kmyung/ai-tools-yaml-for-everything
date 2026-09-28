import { describe, expect, it } from "vitest";
import { describeFailure, failureFromServerDetail, RunFailure, summarizeDetail, toRunFailure } from "../../src/core/failure-copy";
import { LOCALES } from "../../src/core/locale";
import type { FailureRule } from "../../src/core/release";

const SHELL_REASONS = ["server", "network", "cancelled", "unanswered", "missing-file", "unreadable-output"];

const RULES: readonly FailureRule[] = [
  {
    reason: "unreadable-source",
    pattern: /cannot read the source file/i,
    title: { en: "This file could not be read", ko: "읽을 수 없는 파일이에요", zh: "无法读取此文件" },
    hint: { en: "Upload another file.", ko: "다른 파일을 올려 주세요.", zh: "请上传其他文件。" },
  },
];

describe("describeFailure", () => {
  it("gives every shell failure a title and a hint in every locale", () => {
    for (const locale of LOCALES) {
      for (const reason of SHELL_REASONS) {
        const { title, hint } = describeFailure(reason, locale);
        expect([locale, reason, title.length > 0, hint.length > 0]).toEqual([locale, reason, true, true]);
      }
    }
  });

  it("uses the release's copy for its own reasons and the server copy for unknown ones", () => {
    expect(describeFailure("unreadable-source", "ko", RULES).title).toBe("읽을 수 없는 파일이에요");
    expect(describeFailure("unreadable-source", "en", RULES).hint).toBe("Upload another file.");
    expect(describeFailure("gone-from-this-release", "zh", RULES)).toEqual(describeFailure("server", "zh"));
    expect(describeFailure("toString", "en")).toEqual(describeFailure("server", "en"));
  });
});

describe("failureFromServerDetail", () => {
  it("matches the release's patterns and drops the traceback", () => {
    const failure = failureFromServerDetail("cannot read the source file 'upload'\nTraceback (most recent call last): ...", RULES);
    expect([failure.reason, failure.detail]).toEqual(["unreadable-source", "cannot read the source file 'upload'"]);
    expect(failureFromServerDetail("something else", RULES).reason).toBe("server");
  });
});

describe("toRunFailure", () => {
  it("tells a lost connection from a server fault", () => {
    expect(toRunFailure(new Error("The server could not be reached.")).reason).toBe("network");
    expect(toRunFailure(new Error("The connection to the server was lost.")).reason).toBe("network");
    expect(toRunFailure(new Error("Workflow not found")).reason).toBe("server");
  });

  it("passes a failure that already has a reason through", () => {
    const failure = new RunFailure("missing-file", "sample.bin");
    expect(toRunFailure(failure)).toBe(failure);
  });
});

describe("summarizeDetail", () => {
  it("cuts a long message", () => {
    expect(summarizeDetail("가".repeat(300))).toHaveLength(241);
  });
});
