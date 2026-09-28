import { describe, expect, it } from "vitest";
import { opensFromTrigger, readListKey } from "../../../src/ui/select/select-keys";

describe("readListKey", () => {
  it("moves, jumps, chooses and closes like a native list", () => {
    expect(readListKey("ArrowDown")).toEqual({ kind: "move", step: 1 });
    expect(readListKey("Home")).toEqual({ kind: "edge", edge: "first" });
    expect(readListKey(" ")).toEqual({ kind: "choose" });
    expect(readListKey("Escape")).toEqual({ kind: "close" });
  });

  it("lets Tab close the list and still move focus on", () => {
    expect(readListKey("Tab")).toEqual({ kind: "leave" });
  });

  it("ignores other keys", () => {
    expect(readListKey("a")).toBeNull();
  });
});

describe("opensFromTrigger", () => {
  it("opens on the arrows, leaving Enter and Space to the button itself", () => {
    expect([opensFromTrigger("ArrowDown"), opensFromTrigger("ArrowUp")]).toEqual([true, true]);
    expect([opensFromTrigger("Enter"), opensFromTrigger(" ")]).toEqual([false, false]);
  });
});
