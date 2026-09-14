import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASELINE_RUNTIME_PREFIX = "model-compose";
const FONT_STYLESHEET = "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600&family=Noto+Sans+KR:wght@400;600&family=Noto+Sans+SC:wght@400;600&family=Noto+Sans+JP:wght@400;600&display=block";
const FONT_FAMILY = `"Noto Sans", "Noto Sans KR", "Noto Sans SC", "Noto Sans JP", sans-serif`;
const FONT_LOAD_BUDGET_MILLISECONDS = 10000;
const PADDING = 40;
const ROW_HEIGHT = 64;
const DEVICE_SCALE_FACTOR = 2;
const REFERENCE_IMAGE = { name: "rtf-reference.png", width: 560 };
const BUILDS_IMAGE = { name: "rtf-builds.png", width: 960 };

const MACHINE_COLUMN = { key: "machine", title: "기기", value: (row) => row.label };
const BUILD_COLUMN = { key: "build", title: "모델", value: (row) => row.build };
const VALUE_COLUMN = { key: "value", title: "RTF", value: (row) => row.realTimeFactor.toFixed(2) };

const run = promisify(execFile);

const argumentsList = process.argv.slice(2);
const sources = argumentsList.filter((argument) => !argument.startsWith("--"));
const flags = argumentsList.filter((argument) => argument.startsWith("--"));
const outputDirectory = flags.find((flag) => flag.startsWith("--output-directory="))?.slice("--output-directory=".length);
const labels = new Map(
  flags.filter((flag) => flag.startsWith("--label="))
    .map((flag) => flag.slice("--label=".length))
    .map((pair) => [ pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1) ])
);

if (sources.length === 0 || !outputDirectory) {
  console.error("usage: node rtf-table.mjs <results-directory | result.json>... --output-directory=<directory> [--label=<machine>=<display name> ...]");
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

function measuredResults(results) {
  const measured = results.filter((result) => result.valid && result.real_time_factor !== null);

  results.filter((result) => !measured.includes(result))
    .forEach((result) => console.error(`skipped ${result.machine}: the run is invalid or has no real-time factor`));

  requireOneAudioDuration(measured);

  return measured;
}

function referenceBuild(results) {
  const builds = [ ...new Set(results
    .filter((result) => result.conditions.quantization === "none")
    .filter((result) => result.conditions.runtime.startsWith(BASELINE_RUNTIME_PREFIX))
    .map((result) => result.conditions.build)) ];

  if (builds.length !== 1) {
    throw new Error(`the reference table needs exactly one unquantized ${BASELINE_RUNTIME_PREFIX} build, found ${builds.length}: ${builds.join(", ")}`);
  }

  return builds[0];
}

function tableRows(results) {
  return results
    .map((result) => ({
      label: labels.get(result.machine) || result.machine,
      build: result.conditions.build,
      quantization: result.conditions.quantization,
      realTimeFactor: result.real_time_factor,
    }))
    .sort((left, right) => left.realTimeFactor - right.realTimeFactor);
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function imageHeight(rows) {
  return PADDING * 2 + (rows.length + 1) * ROW_HEIGHT;
}

function tableHtml(columns, rows, width) {
  const header = columns.map((column) => `<th class="${column.key}">${escapeHtml(column.title)}</th>`).join("");
  const body = rows.map((row) => {
    const cells = columns.map((column) => `<td class="${column.key}">${escapeHtml(column.value(row))}</td>`).join("");

    return `<tr>${cells}</tr>`;
  }).join("\n    ");

  return `<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="${FONT_STYLESHEET}">
<style>
  html, body { margin: 0; background: #ffffff; }
  body {
    box-sizing: border-box;
    width: ${width}px;
    height: ${imageHeight(rows)}px;
    padding: ${PADDING}px;
    font-family: ${FONT_FAMILY};
    color: #111827;
  }
  table { width: 100%; border-collapse: collapse; }
  tr { height: ${ROW_HEIGHT}px; border-bottom: 1px solid #e5e7eb; }
  tr:last-child { border-bottom: none; }
  th { font-size: 20px; font-weight: 600; color: #6b7280; text-align: left; }
  td { font-size: 26px; white-space: nowrap; }
  td.machine { font-weight: 600; }
  td.build { font-size: 22px; color: #374151; }
  .value { text-align: right; font-variant-numeric: tabular-nums; }
</style>
<table>
  <thead><tr>${header}</tr></thead>
  <tbody>
    ${body}
  </tbody>
</table>
`;
}

async function screenshot(html, width, height, path) {
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
      `--virtual-time-budget=${FONT_LOAD_BUDGET_MILLISECONDS}`,
      `--force-device-scale-factor=${DEVICE_SCALE_FACTOR}`,
      `--window-size=${width},${height}`,
      `--screenshot=${resolve(path)}`,
      pathToFileURL(pagePath).href,
    ], { maxBuffer: 32 * 1024 * 1024 });
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }

  console.log("wrote " + resolve(path));
}

async function renderTable(image, columns, rows) {
  await screenshot(tableHtml(columns, rows, image.width), image.width, imageHeight(rows), join(outputDirectory, image.name));
}

try {
  const results = measuredResults(await readResults(sources));

  if (results.length === 0) throw new Error(`no valid result with a real-time factor in ${sources.join(", ")}`);

  const reference = referenceBuild(results);
  const rows = tableRows(results);
  const referenceRows = rows.filter((row) => row.build === reference && row.quantization === "none");

  await renderTable(REFERENCE_IMAGE, [ MACHINE_COLUMN, VALUE_COLUMN ], referenceRows);

  if (referenceRows.length === rows.length) {
    console.error(`skipped ${BUILDS_IMAGE.name}: every row runs the unquantized ${reference}`);
  } else {
    await renderTable(BUILDS_IMAGE, [ MACHINE_COLUMN, BUILD_COLUMN, VALUE_COLUMN ], rows);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
