import { describe, expect, it } from "vitest";
import { edgeEnabledIndex, initialActiveIndex, stepEnabledIndex, type SelectOption } from "../../../src/ui/select/select-options";

const options: SelectOption[] = [
  { value: "first", label: "첫째" },
  { value: "second", label: "둘째", disabled: true },
  { value: "third", label: "셋째" },
];

describe("stepEnabledIndex", () => {
  it("skips a disabled option", () => {
    expect(stepEnabledIndex(options, 0, 1)).toBe(2);
    expect(stepEnabledIndex(options, 2, -1)).toBe(0);
  });

  it("stops at the ends instead of wrapping", () => {
    expect(stepEnabledIndex(options, 2, 1)).toBe(2);
    expect(stepEnabledIndex(options, 0, -1)).toBe(0);
  });
});

describe("edgeEnabledIndex", () => {
  it("finds the first and last options that can be chosen", () => {
    const leadingDisabled: SelectOption[] = [{ value: "a", label: "A", disabled: true }, ...options];
    expect(edgeEnabledIndex(leadingDisabled, "first")).toBe(1);
    expect(edgeEnabledIndex(options, "last")).toBe(2);
  });

  it("has nothing to offer when every option is disabled", () => {
    expect(edgeEnabledIndex([{ value: "a", label: "A", disabled: true }], "first")).toBe(-1);
  });
});

describe("initialActiveIndex", () => {
  it("opens on the chosen option, or on the first choosable one when that is disabled", () => {
    expect(initialActiveIndex(options, "third")).toBe(2);
    expect(initialActiveIndex(options, "second")).toBe(0);
  });
});
