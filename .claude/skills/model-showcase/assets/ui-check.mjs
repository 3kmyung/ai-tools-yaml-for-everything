import { execFile } from "node:child_process";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { serve } from "./serve.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8099;
const VIEWPORT_FRAME_WIDTH = 24;
const VIEWPORT_FRAME_HEIGHT = 111;
const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const [ uiDirectory ] = process.argv.slice(2);
const options = new Map(
  process.argv.slice(3).filter((argument) => argument.startsWith("--"))
    .map((argument) => argument.replace(/^--/, "").split("="))
);

for (const [ name, value ] of options) {
  if (value === undefined) {
    console.error(`--${name} requires a value: --${name}=...`);
    process.exit(1);
  }
}

const root = resolve(uiDirectory);
const width = options.get("width") || "1440";
const height = options.get("height") || "900";
const screenshot = options.get("screenshot");

const iframeSourceAttribute = 'src="./index.html"';
const testHtmlPath = join(here, "test.html");
const testTemplate = await readFile(testHtmlPath, "utf8");
const testHtml = testTemplate.replace(
  iframeSourceAttribute,
  `src="./index.html?expect-width=${width}"`,
);

if (testHtml === testTemplate) {
  throw new Error(`could not find ${iframeSourceAttribute} in ${testHtmlPath} to inject expect-width`);
}

await writeFile(join(root, "test.html"), testHtml);
await copyFile(join(here, "checks.js"), join(root, "checks.js"));

const screenWidth = Number(width) + VIEWPORT_FRAME_WIDTH;
const screenHeight = Number(height) + VIEWPORT_FRAME_HEIGHT;

const server = await serve(root, PORT);
const flags = [
  "--headless",
  "--disable-gpu",
  "--no-sandbox",
  "--virtual-time-budget=5000",
  "--start-maximized",
  `--screen-info={${screenWidth}x${screenHeight} devicePixelRatio=1}`,
];

const target = screenshot
  ? `http://127.0.0.1:${PORT}/index.html`
  : `http://127.0.0.1:${PORT}/test.html`;

if (screenshot) flags.push(`--screenshot=${resolve(screenshot)}`);
else flags.push("--dump-dom");

const command = [ CHROME, ...flags, target ];
let stdout;

try {
  ({ stdout } = await run(CHROME, [ ...flags, target ], { maxBuffer: 32 * 1024 * 1024 }));
} catch (error) {
  server.close();
  console.error(`could not run ${command.join(" ")}: ${error.message}`);
  process.exit(1);
}

server.close();

if (screenshot) {
  console.log("wrote " + resolve(screenshot));
  process.exit(0);
}

const finished = /<title>done<\/title>/.test(stdout);
const entries = [ ...stdout.matchAll(/<li class="(pass|fail|info)">([\s\S]*?)<\/li>/g) ]
  .map((match) => ({ className: match[1], text: match[2].replace(/&mdash;|&#8212;/g, "—").trim() }));

entries.forEach((entry) => console.log(entry.text));

if (!finished) {
  console.log("FAIL harness — check script did not finish (module import error, or --virtual-time-budget expired before the iframe finished loading)");
  process.exit(1);
}

const checkEntries = entries.filter((entry) => entry.className === "pass" || entry.className === "fail");

if (checkEntries.length === 0) {
  console.log("FAIL harness — no checks ran (CHECKS was empty)");
  process.exit(1);
}

process.exit(checkEntries.some((entry) => entry.className === "fail") ? 1 : 0);
