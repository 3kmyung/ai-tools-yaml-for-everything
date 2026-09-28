import { describe, expect, it } from "vitest";
import { placePanel } from "../../../src/ui/select/place-panel";

const viewport = { width: 1200, height: 800 };
const panel = { width: 240, height: 300 };

describe("placePanel", () => {
  it("opens below a trigger near the top of the page", () => {
    const placement = placePanel({ top: 100, bottom: 132, left: 400 }, panel, viewport);
    expect(placement).toEqual({ top: 138, left: 400, maxHeight: 800 - 132 - 6 - 16 });
  });

  it("opens above a trigger in a composer at the bottom of the thread", () => {
    const placement = placePanel({ top: 720, bottom: 752, left: 400 }, panel, viewport);
    expect(placement.top).toBe(720 - 6 - 300);
    expect(placement.maxHeight).toBe(720 - 6 - 16);
  });

  it("keeps the panel inside the page's side margins", () => {
    expect(placePanel({ top: 100, bottom: 132, left: 1100 }, panel, viewport).left).toBe(1200 - 16 - 240);
    expect(placePanel({ top: 100, bottom: 132, left: 4 }, panel, viewport).left).toBe(16);
  });

  it("gives a list taller than either side the larger side, and lets it scroll", () => {
    const tall = placePanel({ top: 380, bottom: 412, left: 400 }, { width: 240, height: 900 }, viewport);
    expect(tall).toEqual({ top: 412 + 6, left: 400, maxHeight: 800 - 412 - 6 - 16 });
  });
});
