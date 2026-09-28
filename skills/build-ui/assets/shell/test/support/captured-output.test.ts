import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { capturedOutputName, readCapturedOutput, readCapturedOutputFrom } from "./captured-output";

const directories: string[] = [];

function releaseDirectory(files: Record<string, string>): URL {
  const directory = mkdtempSync(join(tmpdir(), "captured-output-"));
  directories.push(directory);
  Object.entries(files).forEach(([name, text]) => writeFileSync(join(directory, name), text));
  return pathToFileURL(`${directory}/`);
}

afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe("readCapturedOutput", () => {
  it("names one file per workflow when a workflow is given", () => {
    expect(capturedOutputName()).toBe("captured-output.json");
    expect(capturedOutputName("beta")).toBe("captured-output.beta.json");
  });

  it("reads the outputs keyed by job id", () => {
    const directory = releaseDirectory({
      "captured-output.json": JSON.stringify({ __job__: { text: "안녕" } }),
      "captured-output.strict.json": JSON.stringify({ trim: [1, 2] }),
    });
    expect(readCapturedOutputFrom(directory)).toEqual({ __job__: { text: "안녕" } });
    expect(readCapturedOutputFrom(directory, "strict")).toEqual({ trim: [1, 2] });
  });

  it("says how to get the file when it is missing", () => {
    expect(() => readCapturedOutput("no-such-workflow")).toThrow(/captured-output\.no-such-workflow\.json is missing: capture/);
  });

  it("rejects output that is not keyed by job id", () => {
    const directory = releaseDirectory({ "captured-output.json": "[1, 2]" });
    expect(() => readCapturedOutputFrom(directory)).toThrow("not a JSON object");
  });
});
