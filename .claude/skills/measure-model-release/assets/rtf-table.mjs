import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASELINE_RUNTIME_PREFIX = "model-compose";
const IMAGE_WIDTH = 720;
const PADDING = 40;
const ROW_HEIGHT = 64;
const CAPTION_HEIGHT = 48;
const DEVICE_SCALE_FACTOR = 2;
const QUANTIZATION_LABELS = { int8: "8bit", int4: "4bit", nf4: "nf4" };
const BACKEND_LABELS = { mlx: "MLX", bitsandbytes: "bitsandbytes", quanto: "quanto", torchao: "torchao" };

const run = promisify(execFile);

const argumentsList = process.argv.slice(2);
const sources = argumentsList.filter((argument) => !argument.startsWith("--"));
const flags = argumentsList.filter((argument) => argument.startsWith("--"));
const outputPath = flags.find((flag) => flag.startsWith("--output="))?.slice("--output=".length);
const labels = new Map(
  flags.filter((flag) => flag.startsWith("--label="))
    .map((flag) => flag.slice("--label=".length))
    .map((pair) => [ pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1) ])
);

if (sources.length === 0 || !outputPath) {
  console.error("usage: node rtf-table.mjs <results-directory | result.json>... --output=<png> [--label=<machine>=<display name> ...]");
  process.exit(1);
}

async function resultPaths(source) {
  if (!(await stat(source)).isDirectory()) return [ source ];

  const names = (await readdir(source)).filter((name) => name.endsWith(".json"));

  return names.map((name) => join(source, name));
}

async function readResults(sourceList) {
  const paths = (await Promise.all(sourceList.map(resultPaths))).flat();

  return Promise.all(paths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
}

function requireOneAudioDuration(results) {
  const durations = [ ...new Set(results.map((result) => result.conditions.audio_duration_seconds)) ];

  if (durations.length === 1) return;

  const machinesByDuration = durations.map((duration) => {
    const machines = results.filter((result) => result.conditions.audio_duration_seconds === duration)
      .map((result) => result.machine);

    return `${duration}s: ${machines.join(", ")}`;
  });

  throw new Error(`real-time factors over different audio lengths are not comparable; pass only the result files for one length (${machinesByDuration.join("; ")})`);
}

function conditionNote(conditions) {
  const quantized = conditions.quantization !== "none";
  const converted = !conditions.runtime.startsWith(BASELINE_RUNTIME_PREFIX);

  if (!quantized && !converted) return "";

  const numerics = quantized
    ? `${QUANTIZATION_LABELS[conditions.quantization]} ${BACKEND_LABELS[conditions.quantization_backend]}`
    : conditions.runtime;

  return `${numerics} ${converted ? "변환본" : "양자화"}`;
}

function tableRows(results) {
  const measured = results.filter((result) => result.valid && result.real_time_factor !== null);

  results.filter((result) => !measured.includes(result))
    .forEach((result) => console.error(`skipped ${result.machine}: the run is invalid or has no real-time factor`));

  requireOneAudioDuration(measured);

  return measured
    .map((result) => ({
      label: labels.get(result.machine) || result.machine,
      realTimeFactor: result.real_time_factor,
      note: conditionNote(result.conditions),
    }))
    .sort((left, right) => left.realTimeFactor - right.realTimeFactor);
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function imageHeight(rows) {
  return PADDING * 2 + rows.length * ROW_HEIGHT + CAPTION_HEIGHT;
}

function tableHtml(rows) {
  const body = rows.map((row) => `
    <tr>
      <td class="machine">${escapeHtml(row.label)}</td>
      <td class="value">RTF ${row.realTimeFactor.toFixed(2)}</td>
      <td class="note">${escapeHtml(row.note)}</td>
    </tr>`).join("");

  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: #ffffff; }
  body {
    box-sizing: border-box;
    width: ${IMAGE_WIDTH}px;
    height: ${imageHeight(rows)}px;
    padding: ${PADDING}px;
    font-family: "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
    color: #111827;
  }
  table { width: 100%; border-collapse: collapse; }
  tr { height: ${ROW_HEIGHT}px; border-bottom: 1px solid #e5e7eb; }
  tr:last-child { border-bottom: none; }
  td { font-size: 26px; white-space: nowrap; }
  .machine { font-weight: 600; }
  .value { font-variant-numeric: tabular-nums; text-align: right; padding-right: 28px; }
  .note { font-size: 20px; color: #6b7280; }
  .caption { height: ${CAPTION_HEIGHT}px; margin: 0; display: flex; align-items: flex-end; font-size: 18px; color: #9ca3af; }
</style>
<table>${body}
</table>
<p class="caption">RTF는 낮을수록 빠르고, 1 미만이면 실시간보다 빠릅니다</p>
`;
}

async function screenshot(html, height, path) {
  const workDirectory = await mkdtemp(join(tmpdir(), "rtf-table-"));
  const pagePath = join(workDirectory, "index.html");

  await writeFile(pagePath, html);

  try {
    await run(CHROME, [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      `--user-data-dir=${join(workDirectory, "profile")}`,
      `--force-device-scale-factor=${DEVICE_SCALE_FACTOR}`,
      `--window-size=${IMAGE_WIDTH},${height}`,
      `--screenshot=${resolve(path)}`,
      pathToFileURL(pagePath).href,
    ], { maxBuffer: 32 * 1024 * 1024 });
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

try {
  const rows = tableRows(await readResults(sources));

  if (rows.length === 0) throw new Error(`no valid result with a real-time factor in ${sources.join(", ")}`);

  await screenshot(tableHtml(rows), imageHeight(rows), outputPath);

  console.log("wrote " + resolve(outputPath));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
