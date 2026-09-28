import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../../src/lib/create-id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createId", () => {
  it("makes a version 4 UUID where randomUUID is available", () => {
    expect(createId()).toMatch(UUID_V4);
  });

  it("still makes one on a plain http page, where randomUUID is missing", () => {
    const realCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (array: Uint8Array<ArrayBuffer>) => realCrypto.getRandomValues(array) });
    const identifiers = new Set([createId(), createId(), createId()]);
    expect([...identifiers].every((identifier) => UUID_V4.test(identifier))).toBe(true);
    expect(identifiers.size).toBe(3);
  });
});
