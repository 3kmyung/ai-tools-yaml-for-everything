import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { serve } from "../../build-model-release/assets/serve.mjs";
import { screenInfoFlag } from "../../build-model-release/assets/viewport.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = "ffmpeg";
const STATIC_SERVER_PORT = 8199;
const DEBUGGER_PORT = 9319;
const SCREENSHOT_VIRTUAL_TIME_BUDGET_MILLISECONDS = 5000;
const SETTLE_MILLISECONDS = 1500;
const DEFAULT_VIDEO_DURATION_MILLISECONDS = 6000;
const DEBUGGER_READY_TIMEOUT_MILLISECONDS = 10000;
const DEBUGGER_POLL_INTERVAL_MILLISECONDS = 100;
const VIDEO_FRAME_RATE = 30;
const MINIMUM_FRAME_DURATION_SECONDS = 1 / VIDEO_FRAME_RATE;
const VIEWPORT_SETTLE_ATTEMPTS = 5;

const run = promisify(execFile);

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
const screenshotPath = options.get("screenshot");
const videoPath = options.get("video");
const videoDurationMilliseconds = Number(options.get("duration") || DEFAULT_VIDEO_DURATION_MILLISECONDS);

if (!screenshotPath && !videoPath) {
  console.error("pass --screenshot=<path> or --video=<path>");
  process.exit(1);
}

if (screenshotPath && videoPath) {
  console.error("pass only one of --screenshot or --video, not both");
  process.exit(1);
}

function launchChrome(flags) {
  return spawn(CHROME, flags, { stdio: [ "ignore", "ignore", "pipe" ] });
}

async function waitForDebugger(port) {
  const deadline = Date.now() + DEBUGGER_READY_TIMEOUT_MILLISECONDS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch (notReady) {}

    await new Promise((waken) => setTimeout(waken, DEBUGGER_POLL_INTERVAL_MILLISECONDS));
  }

  throw new Error(`chrome did not open its devtools port ${port} within ${DEBUGGER_READY_TIMEOUT_MILLISECONDS}ms`);
}

function createDevtoolsClient(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  const frameListeners = [];
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve: resolveCall, reject: rejectCall } = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) rejectCall(new Error(message.error.message));
      else resolveCall(message.result);

      return;
    }

    if (message.method === "Page.screencastFrame") {
      frameListeners.forEach((listener) => listener(message.params));
    }
  });

  function send(method, params = {}) {
    const id = nextId;
    nextId += 1;

    return new Promise((resolveCall, rejectCall) => {
      pending.set(id, { resolve: resolveCall, reject: rejectCall });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function onScreencastFrame(listener) {
    frameListeners.push(listener);
  }

  function opened() {
    return new Promise((resolveOpen) => socket.addEventListener("open", resolveOpen, { once: true }));
  }

  function close() {
    socket.close();
  }

  return { send, onScreencastFrame, opened, close };
}

async function captureScreenshot() {
  const server = await serve(root, STATIC_SERVER_PORT);
  const flags = [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    `--virtual-time-budget=${SCREENSHOT_VIRTUAL_TIME_BUDGET_MILLISECONDS}`,
    "--start-maximized",
    screenInfoFlag(width, height),
    `--screenshot=${resolve(screenshotPath)}`,
    `http://127.0.0.1:${STATIC_SERVER_PORT}/index.html`,
  ];

  try {
    await run(CHROME, flags, { maxBuffer: 32 * 1024 * 1024 });
  } finally {
    server.close();
  }

  console.log("wrote " + resolve(screenshotPath));
}

async function collectScreencastFrames(client, frameDirectory, durationMilliseconds) {
  const frames = [];
  let frameCount = 0;

  client.onScreencastFrame((frame) => {
    frameCount += 1;
    const framePath = join(frameDirectory, `frame-${String(frameCount).padStart(6, "0")}.png`);

    frames.push({ path: framePath, timestamp: frame.metadata.timestamp });
    writeFile(framePath, Buffer.from(frame.data, "base64"));
    client.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
  });

  await client.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  await new Promise((waken) => setTimeout(waken, durationMilliseconds));
  await client.send("Page.stopScreencast");

  return frames;
}

function frameDurationsSeconds(frames) {
  return frames.map((frame, index) => {
    const next = frames[index + 1];
    const previous = frames[index - 1];
    const duration = next
      ? next.timestamp - frame.timestamp
      : previous
        ? frame.timestamp - previous.timestamp
        : MINIMUM_FRAME_DURATION_SECONDS;

    return Math.max(duration, MINIMUM_FRAME_DURATION_SECONDS);
  });
}

function concatListContents(frames, durations) {
  const lines = frames.flatMap((frame, index) => [
    `file '${frame.path.replace(/'/g, "'\\''")}'`,
    `duration ${durations[index].toFixed(4)}`,
  ]);

  lines.push(`file '${frames[frames.length - 1].path.replace(/'/g, "'\\''")}'`);

  return lines.join("\n") + "\n";
}

async function assembleVideo(frames, outputPath) {
  const frameDirectory = dirname(frames[0].path);
  const concatListPath = join(frameDirectory, "frames.txt");
  const durations = frameDurationsSeconds(frames);

  await writeFile(concatListPath, concatListContents(frames, durations));

  await run(FFMPEG, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatListPath,
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    "-r", String(VIDEO_FRAME_RATE),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    resolve(outputPath),
  ], { maxBuffer: 32 * 1024 * 1024 });
}

async function currentViewport(client) {
  const evaluation = await client.send("Runtime.evaluate", {
    expression: "({ width: window.innerWidth, height: window.innerHeight })",
    returnByValue: true,
  });

  return evaluation.result.value;
}

async function overrideDeviceMetrics(client) {
  return client.send("Emulation.setDeviceMetricsOverride", {
    width: Number(width),
    height: Number(height),
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function settleViewport(client) {
  for (let attempt = 0; attempt < VIEWPORT_SETTLE_ATTEMPTS; attempt += 1) {
    await overrideDeviceMetrics(client);
    await new Promise((waken) => setTimeout(waken, SETTLE_MILLISECONDS));

    const actual = await currentViewport(client);
    if (actual.width === Number(width) && actual.height === Number(height)) return;
  }

  const actual = await currentViewport(client);
  throw new Error(`viewport settled at ${actual.width}x${actual.height} instead of the requested ${width}x${height}`);
}

async function captureVideo() {
  const server = await serve(root, STATIC_SERVER_PORT);
  const flags = [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--start-maximized",
    screenInfoFlag(width, height),
    `--remote-debugging-port=${DEBUGGER_PORT}`,
    `http://127.0.0.1:${STATIC_SERVER_PORT}/index.html`,
  ];

  const chrome = launchChrome(flags);
  const frameDirectory = await mkdtemp(join(tmpdir(), "model-report-capture-"));
  let client = null;

  try {
    await waitForDebugger(DEBUGGER_PORT);

    const targets = await (await fetch(`http://127.0.0.1:${DEBUGGER_PORT}/json/list`)).json();
    const page = targets.find((target) => target.type === "page");

    if (!page) throw new Error("chrome reported no page target to record");

    client = createDevtoolsClient(page.webSocketDebuggerUrl);
    await client.opened();

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await settleViewport(client);

    const frames = await collectScreencastFrames(client, frameDirectory, videoDurationMilliseconds);

    if (frames.length === 0) throw new Error("no screencast frames were captured");

    await assembleVideo(frames, videoPath);
  } finally {
    if (client) {
      try {
        await client.send("Browser.close");
      } catch (closeCommandFailed) {
        chrome.kill();
      }
      client.close();
    } else {
      chrome.kill();
    }

    server.close();
    await rm(frameDirectory, { recursive: true, force: true });
  }

  console.log("wrote " + resolve(videoPath));
}

try {
  if (screenshotPath) await captureScreenshot();
  else await captureVideo();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
