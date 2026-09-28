import { describe, expect, it } from "vitest";
import { resolveApiUrl } from "../../src/api/controller";

const ADDRESS = { port: 8080, basePath: "/api" };

describe("resolveApiUrl", () => {
  it("reaches the controller on the host that served the page", () => {
    expect(resolveApiUrl(ADDRESS, undefined, { protocol: "http:", hostname: "192.168.0.7" })).toBe("http://192.168.0.7:8080/api");
    expect(resolveApiUrl({ port: 9000, basePath: "/" }, undefined, { protocol: "https:", hostname: "box" })).toBe("https://box:9000");
  });

  it("prefers a configured url without its trailing slash", () => {
    expect(resolveApiUrl(ADDRESS, " http://localhost:18080/api/ ", { protocol: "http:", hostname: "x" })).toBe("http://localhost:18080/api");
    expect(resolveApiUrl(ADDRESS, "  ", { protocol: "http:", hostname: "" })).toBe("http://localhost:8080/api");
  });
});
