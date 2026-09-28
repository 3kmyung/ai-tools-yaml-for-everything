import { describe, expect, it } from "vitest";
import { encodeMonoPcm16Wav } from "../../src/audio/wav-encoder";

function tagAt(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

describe("encodeMonoPcm16Wav", () => {
  it("writes a 16-bit mono header with real sizes", () => {
    const view = new DataView(encodeMonoPcm16Wav(new Float32Array(4), 48000));
    expect([tagAt(view, 0), tagAt(view, 8), tagAt(view, 36)]).toEqual(["RIFF", "WAVE", "data"]);
    expect([view.getUint32(4, true), view.getUint32(24, true), view.getUint16(22, true), view.getUint32(40, true)]).toEqual([44, 48000, 1, 8]);
  });

  it("clamps samples into the 16-bit range", () => {
    const view = new DataView(encodeMonoPcm16Wav(new Float32Array([2, -2, 0]), 8000));
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([32767, -32768, 0]);
  });
});
