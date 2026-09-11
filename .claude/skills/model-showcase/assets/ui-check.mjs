import { execFile } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { serve } from "./serve.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 8099;
const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const [ uiDirectory ] = process.argv.slice(2);
const options = new Map(
  process.argv.slice(3).filter((argument) => argument.startsWith("--"))
    .map((argument) => argument.replace(/^--/, "").split("="))
);

const root = resolve(uiDirectory);
const width = options.get("width") || "1440";
const height = options.get("height") || "900";
const screenshot = options.get("screenshot");

await copyFile(join(here, "test.html"), join(root, "test.html"));
await copyFile(join(here, "checks.js"), join(root, "checks.js"));

const server = await serve(root, PORT);
const flags = [
  "--headless",
  "--disable-gpu",
  "--no-sandbox",
  "--virtual-time-budget=5000",
  `--window-size=${width},${height}`,
];

const target = screenshot
  ? `http://127.0.0.1:${PORT}/index.html`
  : `http://127.0.0.1:${PORT}/test.html`;

if (screenshot) flags.push(`--screenshot=${resolve(screenshot)}`);
else flags.push("--dump-dom");

const { stdout } = await run(CHROME, [ ...flags, target ], { maxBuffer: 32 * 1024 * 1024 });

server.close();

if (screenshot) {
  console.log("wrote " + resolve(screenshot));
  process.exit(0);
}

const finished = /<title>done<\/title>/.test(stdout);
const lines = [ ...stdout.matchAll(/<li class="(pass|fail)">([\s\S]*?)<\/li>/g) ]
  .map((match) => match[2].replace(/&mdash;|&#8212;/g, "—").trim());

lines.forEach((line) => console.log(line));

if (!finished) {
  console.log("FAIL harness — check script did not finish (module import error, or --virtual-time-budget expired before the iframe finished loading)");
  process.exit(1);
}

if (lines.length === 0) {
  console.log("FAIL harness — no checks ran (CHECKS was empty)");
  process.exit(1);
}

process.exit(lines.some((line) => line.startsWith("FAIL")) ? 1 : 0);
