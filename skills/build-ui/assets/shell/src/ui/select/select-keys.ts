import type { SelectEdge } from "./select-options";

export type SelectKeyAction =
  | { kind: "move"; step: 1 | -1 }
  | { kind: "edge"; edge: SelectEdge }
  | { kind: "choose" }
  | { kind: "close" }
  | { kind: "leave" };

const LIST_KEYS: Readonly<Record<string, SelectKeyAction>> = {
  ArrowDown: { kind: "move", step: 1 },
  ArrowUp: { kind: "move", step: -1 },
  Home: { kind: "edge", edge: "first" },
  End: { kind: "edge", edge: "last" },
  Enter: { kind: "choose" },
  " ": { kind: "choose" },
  Escape: { kind: "close" },
  Tab: { kind: "leave" },
};

export function readListKey(key: string): SelectKeyAction | null {
  return LIST_KEYS[key] ?? null;
}

const OPENING_ARROWS = new Set(["ArrowDown", "ArrowUp"]);

export function opensFromTrigger(key: string): boolean {
  return OPENING_ARROWS.has(key);
}
