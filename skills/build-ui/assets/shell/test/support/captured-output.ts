import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { JobOutputs, ResultMedia } from "../../src/core/messages";

const WORKSPACE_DIRECTORY = new URL("../../../", import.meta.url);

export function capturedOutputName(workflowId?: string): string {
  return workflowId === undefined ? "captured-output.json" : `captured-output.${workflowId}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readCapturedOutputFrom(directory: URL, workflowId?: string): JobOutputs {
  const location = new URL(capturedOutputName(workflowId), directory);
  const path = fileURLToPath(location);
  if (!existsSync(path)) {
    throw new Error(`${path} is missing: capture the real output with capture_output.py before writing domain tests`);
  }
  const parsed: unknown = JSON.parse(readFileSync(location, "utf8"));
  if (!isRecord(parsed)) throw new Error(`${path} is not a JSON object keyed by job id`);
  return parsed;
}

export function readCapturedOutput(workflowId?: string): JobOutputs {
  return readCapturedOutputFrom(WORKSPACE_DIRECTORY, workflowId);
}

export function readCapturedMediaFrom(directory: URL, media: ResultMedia): Buffer {
  if (!media.file) throw new Error("this media reference carries no captured file name");
  const path = fileURLToPath(new URL(media.file, directory));
  if (!existsSync(path)) {
    throw new Error(`${path} is missing: keep the file capture_output.py saved beside captured-output.json`);
  }
  return readFileSync(path);
}

export function readCapturedMedia(media: ResultMedia): Buffer {
  return readCapturedMediaFrom(WORKSPACE_DIRECTORY, media);
}
