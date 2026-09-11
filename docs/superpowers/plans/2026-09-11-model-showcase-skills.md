# Model Showcase Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `ui-house-style` and `model-showcase` so that `examples/showcase/transcribe-long-meeting` can be generated from a model name rather than hand-written.

**Architecture:** Correct the reference UI at `examples/media-processing/youtube-to-playlist-video/ui/` first, because the rules documents describe it and the acceptance check compares generated output against it. Then write the two skills as prose whose factual claims are checked against that corrected code by a script. Then generate the example and iterate on the skills — never on the example.

**Tech Stack:** Vanilla ES modules, plain CSS with custom properties, Node 24 (`node:http`, `node:test`, no dependencies), headless Chrome for capture and in-page assertions, `model-compose` YAML.

**Spec:** `docs/superpowers/specs/2026-09-11-model-showcase-skills-design.md`

## Global Constraints

- Skills live in `~/.claude/skills/`. They are outside the repository by design; `.gitignore:187` excludes `.claude/`.
- Repository work happens on branch `features/youtube-to-playlist-video`.
- Line endings are LF. `core.autocrlf=input` is set globally; there is no `.gitattributes`.
- No comments in source files. Reasoning goes in the commit message.
- Write files with the Edit and Write tools, never `sed`, `perl`, or shell redirection into a tracked file.
- No `Co-Authored-By` trailer in commits. Backtick every identifier in the commit body.
- JavaScript function bodies read as declaration / work / return, separated by blank lines.
- No abbreviated identifiers: `identifier` not `id`, `context` not `ctx`, `element` not `el`, `band` not `i`.
- Never kill Chrome by image name. Every Chrome invocation is self-exiting (`--dump-dom` or `--screenshot` with `--virtual-time-budget`).
- Chrome is at `/c/Program Files/Google/Chrome/Application/chrome.exe`.
- Colour contrast targets WCAG 2.1 AA: 4.5:1 for normal text.
- Breakpoints are exactly `900px` and `600px`. They are not tokenised; custom properties do not work in `@media` conditions.
- Screenshots go to the session scratchpad, never into the repository. Export it once per shell: `SCRATCH="C:/Users/Unknoown/AppData/Local/Temp/claude/D--users-home-projects-ai-tools-yaml-for-everything/cc7e991d-9bf9-42d2-8ac6-859fc8a0fbec/scratchpad"`.

---

## File Structure

### Repository — `examples/media-processing/youtube-to-playlist-video/`

| File | Action | Responsibility |
|---|---|---|
| `ui/styles/base.css` | modify | tokens, element resets, default focus ring, reduced-motion block |
| `ui/styles/components.css` | modify | class-only reusable widget skins, per-component focus, container query |
| `ui/styles/layout.css` | modify | three-region skeleton, ID selectors for page-region singletons, breakpoints |
| `ui/index.html` | modify | add classes beside the JS-only IDs |
| `ui/src/icons.js` | modify | Lucide path data |
| `ui/src/track-list.js` | modify | `.item*` class names, `data-item` attribute |
| `ui/src/status.js` | modify | `.action-cancel` / `.action-resume` / `.status-message` class names |
| `.gitignore` | modify | ignore the generated verification harness inside `ui/` |

### Skill — `~/.claude/skills/ui-house-style/`

| File | Action | Responsibility |
|---|---|---|
| `SKILL.md` | create | when to invoke, four-step process, self-critique checklist |
| `references/tokens.md` | create | `base.css` verbatim plus scale rules and the accent split |
| `references/layout.md` | create | three-region skeleton, breakpoints, scroll fade |
| `references/components.md` | create | widget markup and behaviour, icon sourcing |
| `references/css-patterns.md` | create | bans with replacement and reason, focus rule, reduced motion |
| `references/js-patterns.md` | create | module shape, DOM construction, naming, paragraphs |
| `references/streaming.md` | create | streaming input and output vocabulary |
| `check-rules.mjs` | create | asserts the prose's factual claims against the reference UI |

### Skill — `~/.claude/skills/model-showcase/`

| File | Action | Responsibility |
|---|---|---|
| `SKILL.md` | create | six steps, two human gates |
| `references/research.md` | create | source order, required fields, licence gate, no-guessing rule |
| `references/compose.md` | create | task mapping, static webui, workflow ids, verbatim client copy |
| `references/readme.md` | create | three READMEs, `examples/README.md` index entry |
| `references/verify.md` | create | fast-loop procedure |
| `assets/serve.mjs` | create | dependency-free static server with correct MIME types |
| `assets/ui-check.mjs` | create | drives Chrome, collects in-page assertion results and screenshots |
| `assets/test.html` | create | loads a fixture, runs assertions, writes results into the DOM |

### Repository — new example

| File | Action | Responsibility |
|---|---|---|
| `examples/showcase/transcribe-long-meeting/**` | create | generated by `model-showcase` in Task 13 |
| `examples/README.md:177-181` | modify | index entry for the new example |

---

## Task 1: Verification harness

**Files:**
- Create: `~/.claude/skills/model-showcase/assets/serve.mjs`
- Create: `~/.claude/skills/model-showcase/assets/ui-check.mjs`
- Create: `~/.claude/skills/model-showcase/assets/test.html`
- Modify: `examples/media-processing/youtube-to-playlist-video/.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `serve.mjs` serves a directory on a given port and exits on SIGINT. `ui-check.mjs` exports nothing; run as `node ui-check.mjs <ui-dir> [--width=N] [--height=N] [--screenshot=PATH]` — the flags take the `=` form, which is what the parser splits on — and exits non-zero when any assertion in the page reports `FAIL`. `checks.js` exports `CHECKS`, an array of `{ name, run }` where `run(frameDocument, frameWindow)` returns `true` or a failure string; results are written into `<ul id="results">` as `<li class="pass">` / `<li class="fail">`.

Python's `http.server` serves `.js` with a MIME type that blocks ES module loading, which is why this server exists. Chrome is driven in `--dump-dom` mode so that it exits by itself; there is no CDP session and no process to kill.

`test.html` hosts `index.html` in a full-viewport iframe and asserts against the frame's document. The checks need the real page — its stylesheets, its computed styles, its markup — and duplicating that markup into a test page would rot immediately. Same origin makes `contentDocument` reachable; the iframe fills the viewport so that `frameWindow.innerWidth` is the width Chrome was launched at and media queries resolve as they would for a user.

- [ ] **Step 1: Write the failing check**

Create `~/.claude/skills/model-showcase/assets/test.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ui checks</title>
  <style>
    html, body { height: 100%; margin: 0; }
    #subject { display: block; width: 100%; height: 100%; border: 0; }
    #results { position: fixed; inset: 0; margin: 0; padding: 0; visibility: hidden; }
  </style>
</head>
<body>
  <iframe id="subject" src="./index.html"></iframe>
  <ul id="results"></ul>
  <script type="module">
    import { CHECKS } from "./checks.js";

    const frame = document.getElementById("subject");
    const results = document.getElementById("results");

    await new Promise((resolve) => {
      const navigated = frame.contentDocument
        && frame.contentDocument.readyState === "complete"
        && frame.contentWindow.location.href !== "about:blank";

      if (navigated) resolve();
      else frame.addEventListener("load", resolve, { once: true });
    });

    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;

    for (const check of CHECKS) {
      const outcome = await Promise.resolve()
        .then(() => check.run(frameDocument, frameWindow))
        .catch((failure) => String(failure));
      const passed = outcome === true;

      const entry = document.createElement("li");
      entry.className = passed ? "pass" : "fail";
      entry.textContent = (passed ? "PASS " : "FAIL ") + check.name + (passed ? "" : " — " + outcome);

      results.appendChild(entry);
    }

    document.title = "done";
  </script>
</body>
</html>
```

Create `~/.claude/skills/model-showcase/assets/checks.js` with one check that must fail until `serve.mjs` and `ui-check.mjs` work:

```js
export const CHECKS = [
  {
    name: "stylesheets loaded",
    run: (frameDocument) => {
      const sheets = [ ...frameDocument.styleSheets ].filter((sheet) => sheet.href);

      return sheets.length > 0 ? true : "no external stylesheet reached the page";
    },
  },
];
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: FAIL with `Cannot find module .../ui-check.mjs`.

- [ ] **Step 3: Write the server**

Create `~/.claude/skills/model-showcase/assets/serve.mjs`:

```js
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wav": "audio/wav",
};

export function serve(root, port) {
  const server = createServer(async (request, response) => {
    const requested = new URL(request.url, "http://localhost").pathname;
    const relative = normalize(requested === "/" ? "/index.html" : requested).replace(/^[\\/]+/, "");
    const absolute = join(root, relative);

    try {
      const body = await readFile(absolute);

      response.writeHead(200, { "content-type": TYPES[extname(absolute)] || "application/octet-stream" });
      response.end(body);
    } catch (missing) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", (error) => reject(new Error("could not listen on port " + port + ": " + error.message)));
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
```

- [ ] **Step 4: Write the Chrome driver**

Create `~/.claude/skills/model-showcase/assets/ui-check.mjs`:

```js
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
```

The two guards are not belt and braces — they catch different failures. `test.html` sets `document.title = "done"` after the loop, so an empty `CHECKS` array still finishes and is caught by the line count, while a module-linking error or a `--virtual-time-budget` that expires mid-navigation never reaches that statement and is caught by the completion marker. Without both, a harness that ran nothing exits 0.

- [ ] **Step 5: Run it to verify it passes**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: `PASS stylesheets loaded`, exit 0.

- [ ] **Step 6: Ignore the copied harness**

Add to `examples/media-processing/youtube-to-playlist-video/.gitignore`:

```
ui/test.html
ui/checks.js
```

- [ ] **Step 7: Commit**

```bash
git add examples/media-processing/youtube-to-playlist-video/.gitignore
git commit -m "Ignore the copied UI verification harness"
```

---

## Task 2: Split the accent token

**Files:**
- Modify: `examples/media-processing/youtube-to-playlist-video/ui/styles/base.css:8-11`
- Modify: `examples/media-processing/youtube-to-playlist-video/ui/styles/components.css:279,337,341,461`
- Modify: `examples/media-processing/youtube-to-playlist-video/ui/styles/layout.css:141`
- Test: `~/.claude/skills/model-showcase/assets/checks.js`

**Interfaces:**
- Consumes: the harness from Task 1.
- Produces: tokens `--accent` (fills, borders, focus rings) and `--accent-text` (text). `--link` aliases `--accent-text`. Later tasks use `--accent` for rings and borders only.

- [ ] **Step 1: Write the failing test**

Replace the contents of `~/.claude/skills/model-showcase/assets/checks.js`:

```js
function channel(value) {
  const normalized = value / 255;

  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color) {
  const [ red, green, blue ] = color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));

  return (lighter + 0.05) / (darker + 0.05);
}

function tokenColor(frameDocument, frameWindow, name) {
  const probe = frameDocument.createElement("div");
  probe.style.color = `var(${name})`;

  frameDocument.body.appendChild(probe);
  const resolved = frameWindow.getComputedStyle(probe).color;
  probe.remove();

  return resolved;
}

export const CHECKS = [
  {
    name: "--accent-text on --background meets 4.5:1",
    run: (frameDocument, frameWindow) => {
      const ratio = contrast(
        tokenColor(frameDocument, frameWindow, "--accent-text"),
        tokenColor(frameDocument, frameWindow, "--background")
      );

      return ratio >= 4.5 ? true : `ratio ${ratio.toFixed(2)}`;
    },
  },
  {
    name: "--background on --accent-text meets 4.5:1",
    run: (frameDocument, frameWindow) => {
      const ratio = contrast(
        tokenColor(frameDocument, frameWindow, "--background"),
        tokenColor(frameDocument, frameWindow, "--accent-text")
      );

      return ratio >= 4.5 ? true : `ratio ${ratio.toFixed(2)}`;
    },
  },
  {
    name: "--link resolves to --accent-text",
    run: (frameDocument, frameWindow) => {
      const link = tokenColor(frameDocument, frameWindow, "--link");
      const accentText = tokenColor(frameDocument, frameWindow, "--accent-text");

      return link === accentText ? true : `link ${link} is not accent-text ${accentText}`;
    },
  },
  {
    name: "no text rule paints with --accent",
    run: async () => {
      const source = await fetch("./styles/components.css").then((response) => response.text());
      const offenders = [ ...source.matchAll(/([^{}]+)\{([^}]*)\}/g) ]
        .filter(([ , selector, body ]) => /color:\s*var\(--accent\)\s*;/.test(body) && !selector.includes(".icon"))
        .map(([ , selector ]) => selector.trim());

      return offenders.length === 0 ? true : offenders.join(" / ");
    },
  },
  {
    name: "#hint does not use --disabled",
    run: (frameDocument, frameWindow) => {
      const hint = frameDocument.getElementById("hint");
      const ratio = contrast(
        frameWindow.getComputedStyle(hint).color,
        tokenColor(frameDocument, frameWindow, "--background")
      );

      return ratio >= 4.5 ? true : `ratio ${ratio.toFixed(2)}`;
    },
  },
];
```

**The shipped `checks.js` is the authority, not this snippet.** Tasks 3–7 each append to the same file, so any copy printed here goes stale the moment the next task runs. Read `~/.claude/skills/model-showcase/assets/checks.js` for the current suite. Three corrections landed during this task and matter to anyone extending it:

- `tokenColor` probes with a sentinel fallback, `var(${name}, rgb(1, 2, 3))`, and `requireTokenColor` treats the resolved sentinel as a missing token. Without it, `color` inherits from `body { color: var(--text) }` and an undefined token resolves to near-black, which clears 4.5:1 against any light surface — a contrast check that passes because its subject does not exist.
- The second check reads `#render-playlist`'s computed `color` against its computed `background-color`. The token-pair version it replaced was `contrast()` called with its arguments swapped, and `contrast()` sorts its luminances internally, so it was the first check written twice.
- The accent-as-text guard matches `color:` declarations whose value mentions `var(--accent)` anywhere — `/(^|[;{])\s*color:\s*[^;]*var\(--accent[,)][^;]*;/`. Requiring `)` or `,` after `--accent` admits `color-mix(in srgb, var(--accent) 85%, black)` while excluding `var(--accent-text)`, and the leading anchor keeps `border-color:` out.

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: `FAIL` on the accent-as-text check, naming `#render-playlist, #add-track, .cancel-render, .resume-render` and `#warning`; `FAIL` on `--link`; `FAIL` on `#hint` at about `2.15`. With the sentinel fallback in place the two token checks also fail with `--accent-text is not defined`.

- [ ] **Step 3: Add the tokens**

In `base.css`, replace the accent block:

```css
  --accent: #007ffb;
  --accent-text: #0a6ed9;
  --icon: var(--text-caption);
  --link: var(--accent-text);
```

- [ ] **Step 4: Move text uses onto the new token**

In `components.css`:

- `#warning { color: var(--accent); }` → `color: var(--accent-text);`
- `#render-playlist, .resume-render { … color: var(--background); }` → change `background: var(--accent)` to `background: var(--accent-text)`
- `:is(#render-playlist, .resume-render):is(:hover, :focus-visible) { background: color-mix(in srgb, var(--accent) 85%, black); }` → `color-mix(in srgb, var(--accent-text) 85%, black)`
- `#render-playlist, #add-track, .cancel-render, .resume-render { … border: 1px solid var(--accent); … color: var(--accent); }` → keep `border: 1px solid var(--accent)` and change `color` to `var(--accent-text)`. The outlined buttons paint their label with the accent, which is the same 3.61:1 failure as the filled one. A 1px border is not text and stays on `--accent`, which clears the 3:1 floor for non-text contrast.

In `layout.css`, change `#hint { color: var(--disabled); }` to `color: var(--text-caption);`.

`.dropdown-option .icon { color: var(--accent); }` stays. It paints a graphic, not text.

- [ ] **Step 5: Run it to verify it passes**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: four `PASS` lines, exit 0.

- [ ] **Step 6: Capture a screenshot for the human check**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui \
  --screenshot=$SCRATCH/shot-accent.png
```
Confirm the blue still reads as the same family, then delete the file.

- [ ] **Step 7: Commit**

```bash
git add examples/media-processing/youtube-to-playlist-video/ui/styles
git commit -F - <<'EOF'
Split `--accent` into a fill token and a text token

`#007ffb` measures 3.61:1 against `--background`, below the 4.5:1 AA floor
for normal text, and it was painting `footer a`, `#warning`, and the text on
the filled primary button. The fill is fine; only the text use failed.
`--accent-text` at `#0a6ed9` measures 4.62:1 and stays in the same blue.

`#hint` moves off `--disabled` (2.15:1). Disabled controls are exempt under
WCAG; instructional text is not.
EOF
```

---

## Task 3: Focus indication

**Files:**
- Modify: `examples/media-processing/youtube-to-playlist-video/ui/styles/base.css:55-58`
- Modify: `examples/media-processing/youtube-to-playlist-video/ui/styles/components.css`
- Test: `~/.claude/skills/model-showcase/assets/checks.js`

**Interfaces:**
- Consumes: `--accent` and `--accent-text` from Task 2.
- Produces: a default inward ring in `base.css`, per-component overrides in `components.css`. Later tasks and generated examples follow the rule "recolour the outermost existing line to `--accent`; if there is none or it is already `--accent`, draw an inward ring".

`:focus-visible` does not reliably match under programmatic focus in headless Chrome, so these checks read the stylesheet rules rather than emulating focus. Visual confirmation is the screenshot in Step 6.

- [ ] **Step 1: Write the failing test**

Append to the `CHECKS` array in `checks.js`:

```js
  {
    name: "base.css declares a default focus ring",
    run: (frameDocument) => {
      const rules = [ ...frameDocument.styleSheets ]
        .flatMap((sheet) => [ ...sheet.cssRules ])
        .filter((rule) => rule.selectorText && rule.selectorText.includes(":focus-visible"));

      const base = rules.find((rule) => rule.selectorText.includes("button") && rule.selectorText.includes("input"));

      if (!base) return "no default :focus-visible rule";
      if (base.style.outlineWidth !== "2px") return `outline-width is ${base.style.outlineWidth}`;
      if (base.style.outlineOffset !== "-2px") return `outline-offset is ${base.style.outlineOffset}`;

      return true;
    },
  },
  {
    name: "no rule removes the outline without a replacement",
    run: (frameDocument) => {
      const offenders = [ ...frameDocument.styleSheets ]
        .flatMap((sheet) => [ ...sheet.cssRules ])
        .filter((rule) => rule.style && [ "0px", "none" ].includes(rule.style.outlineStyle || rule.style.outlineWidth))
        .filter((rule) => !rule.style.borderColor && !rule.style.textDecorationThickness);

      return offenders.length === 0 ? true : offenders.map((rule) => rule.selectorText).join(", ");
    },
  },
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: `FAIL base.css declares a default focus ring — no default :focus-visible rule` and `FAIL no rule removes the outline without a replacement — :is(button, a, input, select):focus-visible`.

- [ ] **Step 3: Replace the global reset**

In `base.css`, replace:

```css
:is(button, a, input, select):focus-visible {
  outline: 0;
}
```

with:

```css
:is(button, a, input, select):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
```

- [ ] **Step 4: Add the per-component overrides**

In `components.css`, after the `.track.is-selected` rule:

```css
:is(.dropdown, .track, .color-picker-swatch):focus-visible {
  outline: none;
  border-color: var(--accent);
}

:is(#render-playlist, .resume-render):focus-visible {
  outline-color: var(--background);
  outline-offset: -3px;
}

footer a:focus-visible {
  outline: none;
  text-decoration-thickness: 2px;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: all checks `PASS`, exit 0.

- [ ] **Step 6: Confirm visually**

Open the UI in a normal browser, Tab through the header and the track list, and confirm every stop is visible and that the ring never spills outside a rounded corner.

- [ ] **Step 7: Commit**

```bash
git add examples/media-processing/youtube-to-playlist-video/ui/styles
git commit -F - <<'EOF'
Give every interactive element a visible focus indicator

`base.css` removed the outline for every button, link, input, and select and
left a 6% `color-mix` background tint in its place, which is not an indicator.
Fields and swatches already recoloured a line they owned; buttons had nothing.

The default is now an inward 2px ring, and a component turns it off only in a
block that supplies its own indicator in the same declaration. Elements that
already own an outer line recolour it to `--accent`; the filled primary button
inverts the ring to `--background` because its own background is the accent.
EOF
```

---

## Task 4: Reduced motion

**Files:**
- Modify: `examples/media-processing/youtube-to-playlist-video/ui/styles/base.css`
- Test: `~/.claude/skills/model-showcase/assets/checks.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a `@media (prefers-reduced-motion: reduce)` block at the end of `base.css`. Generated examples inherit it by copying `base.css` verbatim.

- [ ] **Step 1: Write the failing test**

Append to `CHECKS`:

```js
  {
    name: "base.css honours prefers-reduced-motion",
    run: (frameDocument) => {
      const blocks = [ ...frameDocument.styleSheets ]
        .flatMap((sheet) => [ ...sheet.cssRules ])
        .filter((rule) => rule.media && rule.conditionText.includes("prefers-reduced-motion"));

      if (blocks.length === 0) return "no prefers-reduced-motion block";

      const declarations = [ ...blocks[0].cssRules ][0].style;

      if (!declarations.transitionDuration) return "transition-duration not collapsed";
      if (!declarations.animationDuration) return "animation-duration not collapsed";

      return true;
    },
  },
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: `FAIL base.css honours prefers-reduced-motion — no prefers-reduced-motion block`.

- [ ] **Step 3: Add the block**

Append to `base.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: all checks `PASS`.

- [ ] **Step 5: Confirm the scroll fade does not hide content**

The block does not touch the scroll fades at all, which is the right outcome but not for the reason it first appears. Every element using those keyframes drives them through `animation-timeline: scroll(self inline|block)`, a scroll-progress timeline: progress is the scroll fraction and `animation-duration` does not enter the calculation, so collapsing the duration is a no-op and the mask keeps tracking scroll exactly as before. A gradient that follows the reader's own scrolling is not the kind of motion `prefers-reduced-motion` exists to stop — no autoplay, no loop, no movement the reader did not cause. Capture a screenshot and confirm nothing is clipped:

```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui \
  --screenshot=$SCRATCH/shot-motion.png
```
Delete the file afterwards.

- [ ] **Step 6: Commit**

```bash
git add examples/media-processing/youtube-to-playlist-video/ui/styles/base.css
git commit -F - <<'EOF'
Collapse animation under `prefers-reduced-motion`

Every interactive element transitions, the dropdown and the footer slide, and
the scroll fades animate custom properties, with no reduced-motion handling
anywhere. Collapsing durations is safe for the fades: the properties settle at
their `to` values, which leaves the mask opaque rather than clipping content.
EOF
```

---

## Task 5: Class names

**Files:**
- Modify: `ui/index.html:21,23,29`
- Modify: `ui/styles/components.css:254,260,261,279,293,314,332,337,343,347,418,430,438,442,446,450,454`
- Modify: `ui/src/track-list.js:14,15,37,44,64`
- Modify: `ui/src/status.js:46,79,93`
- Test: `~/.claude/skills/model-showcase/assets/checks.js`

All paths are under `examples/media-processing/youtube-to-playlist-video/`.

**Interfaces:**
- Consumes: the focus rules from Task 3, whose selectors change with the renames.
- Produces: the component class vocabulary that `components.md` documents and that every generated example uses: `.action-primary`, `.action-add`, `.action-cancel`, `.action-resume`, `.caption-warning`, `.status-message`, `.item`, `.item-label`, `.item-remove`.

IDs stay in `index.html` because `getElementById` uses them. Classes are added beside them. `layout.css` keeps its ID selectors: `#settings`, `#workspace`, `#log`, `#hint`, `#tracks`, `#track-scroller`, `#editor`, `#preview` are singleton page regions belonging to the fixed skeleton, not reusable components.

Rename table:

| Old selector | New selector | JS sites |
|---|---|---|
| `#render-playlist` (in `components.css`) | `.action-primary` | none; the ID stays for `getElementById` |
| `#add-track` (in `components.css`) | `.action-add` | none; the ID stays |
| `#warning` (in `components.css`) | `.caption-warning` | none; the ID stays |
| `#log > span` | `.status-message` | `status.js` must set the class on the span it creates |
| `.cancel-render` | `.action-cancel` | `status.js:46,93` |
| `.resume-render` | `.action-resume` | `status.js:79` |
| `.track` | `.item` | `track-list.js:14,64` |
| `.track-label` | `.item-label` | `track-list.js:37` |
| `.remove-track` | `.item-remove` | `track-list.js:44` |
| `data-track` attribute | `data-item` | `track-list.js:15,64` |

- [ ] **Step 1: Write the failing test**

Append to `CHECKS`:

```js
  {
    name: "components.css carries no ID selectors",
    run: async () => {
      const source = await fetch("./styles/components.css").then((response) => response.text());
      const selectors = source.split("}").map((block) => block.split("{")[0]).join(" ");
      const offenders = [ ...selectors.matchAll(/#[a-zA-Z][\w-]*/g) ].map((match) => match[0]);

      return offenders.length === 0 ? true : offenders.join(", ");
    },
  },
  {
    name: "components.css carries no domain nouns",
    run: async () => {
      const source = await fetch("./styles/components.css").then((response) => response.text());
      const offenders = [ ...source.matchAll(/\.[\w-]*(?:track|playlist|render)[\w-]*/g) ].map((match) => match[0]);

      return offenders.length === 0 ? true : offenders.join(", ");
    },
  },
  {
    name: "the component vocabulary is present",
    run: async () => {
      const source = await fetch("./styles/components.css").then((response) => response.text());
      const required = [
        ".action-primary", ".action-add", ".action-cancel", ".action-resume",
        ".caption-warning", ".status-message", ".item", ".item-label", ".item-remove",
      ];
      const missing = required.filter((name) => !source.includes(name));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: three `FAIL` lines. The first lists `#render-playlist`, `#add-track`, `#warning`, `#log`; the second lists `.track`, `.track-label`, `.remove-track`, `.cancel-render`, `.resume-render`; the third lists all nine required classes.

- [ ] **Step 3: Add classes in the markup**

In `index.html`:

```html
      <span id="warning" class="caption-warning" hidden></span>
```
```html
    <button id="render-playlist" class="action-primary" type="button">Render</button>
```
```html
        <button id="add-track" class="action-add" type="button">Add track</button>
```

- [ ] **Step 4: Rewrite the selectors**

Apply the rename table to `components.css`. The five rules that mix old names become:

```css
.field-label, header .setting,
.color-picker-channel-name, .color-picker-readout, .caption-warning {
```
```css
.field-label, .item-label, .dropdown-option > span,
.status-message, .status-trailing a {
```
```css
.caption-warning {
  color: var(--accent-text);
}
```
```css
.revert-field, .item-remove {
```
```css
.action-primary, .action-add, .action-cancel, .action-resume {
```
```css
.action-primary, .action-resume {
```
```css
:is(.action-primary, .action-resume):is(:hover, :focus-visible) {
```
```css
:is(.action-cancel, .action-resume):disabled {
```
```css
:is(.action-add, .action-cancel):is(:hover, :focus-visible):not(:disabled) {
```
```css
:is(.revert-field, .item-remove):is(:hover, :focus-visible):not(:disabled) {
```
```css
.status-message {
  flex: 1 1 0;
}
```

and the Task 3 focus rules become:

```css
:is(.dropdown, .item, .color-picker-swatch):focus-visible {
  outline: none;
  border-color: var(--accent);
}

:is(.action-primary, .action-resume):focus-visible {
  outline-color: var(--background);
  outline-offset: -3px;
}
```

- [ ] **Step 5: Rewrite the JavaScript**

In `track-list.js`:

```js
      item.className = track.id === selectedId ? "item is-selected" : "item";
      item.dataset.item = track.id;
```
```js
      label.className = "item-label";
```
```js
      remove.className = "item-remove";
```
```js
    item.classList.toggle("is-selected", item.dataset.item === selectedId);
```

In `status.js`, set the class on the message span and rename the buttons:

```js
  status.replaceChildren(Object.assign(document.createElement("span"), {
    className: "status-message",
    textContent: message,
  }));
```
```js
  cancel.className = "action-cancel";
```
```js
  resume.className = "action-resume";
```

The second `cancel.className` at line 93 takes the same value.

- [ ] **Step 6: Run it to verify it passes**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: all checks `PASS`.

- [ ] **Step 7: Confirm the render appearance is unchanged**

```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui \
  --screenshot=$SCRATCH/shot-renames.png
```
Compare against the Task 2 screenshot; the only intended difference is the focus ring. Delete both files.

- [ ] **Step 8: Commit**

```bash
git add examples/media-processing/youtube-to-playlist-video/ui
git commit -F - <<'EOF'
Give components class names that do not name this example

`components.css` styled `#render-playlist`, `#add-track`, `#warning`, and
`#log > span` by id, and named three widgets after this example's domain:
`.track`, `.track-label`, `.remove-track`. Commit `846fe3a8` records the cost --
renaming the example meant changing the Render button's DOM id and the CSS that
selects it -- and those two habits are the largest contributors to the 177-line
divergence between this file and the intercutting example's copy.

Ids stay in the markup for `getElementById`; only the CSS moves to classes.
`layout.css` keeps its ids: `#settings`, `#workspace`, `#log`, and the rest are
singleton page regions of a skeleton that does not change per example.
EOF
```

---

## Task 6: Responsive layout

**Files:**
- Modify: `examples/media-processing/youtube-to-playlist-video/ui/styles/layout.css`
- Modify: `examples/media-processing/youtube-to-playlist-video/ui/styles/components.css`
- Test: `~/.claude/skills/model-showcase/assets/checks.js`

**Interfaces:**
- Consumes: the class vocabulary from Task 5.
- Produces: breakpoints at `900px` and `600px` in `layout.css`, and `container-type: inline-size` on `.field-body` with a `@container (width < 20rem)` rule in `components.css`. `layout.md` documents both.

- [ ] **Step 1: Write the failing test**

Append to `CHECKS`:

```js
  {
    name: "the page does not scroll sideways at this width",
    run: (frameDocument, frameWindow) => {
      const scrollWidth = frameDocument.documentElement.scrollWidth;

      return scrollWidth > frameWindow.innerWidth
        ? `scrollWidth ${scrollWidth} > innerWidth ${frameWindow.innerWidth}`
        : true;
    },
  },
  {
    name: "main is single-column below 900px",
    run: (frameDocument, frameWindow) => {
      const main = frameDocument.querySelector("main");
      const columns = frameWindow.getComputedStyle(main).gridTemplateColumns.split(" ").length;

      if (frameWindow.innerWidth >= 900) return columns === 2 ? true : `${columns} columns at wide width`;

      return columns === 1 ? true : `${columns} columns at ${frameWindow.innerWidth}px`;
    },
  },
  {
    name: "field bodies are container queried",
    run: (frameDocument, frameWindow) => {
      const body = frameDocument.querySelector(".field-body");

      if (!body) return true;

      return frameWindow.getComputedStyle(body).containerType === "inline-size"
        ? true
        : "container-type not set";
    },
  },
```

- [ ] **Step 2: Run it at three widths to verify it fails**

Run:
```bash
for size in "1440 900" "800 900" "390 844"; do
  set -- $size
  node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
    examples/media-processing/youtube-to-playlist-video/ui --width=$1 --height=$2
done
```
Expected: the `800` and `390` runs fail on sideways scroll and on column count; the `1440` run fails only on the container query.

- [ ] **Step 3: Add the breakpoints**

Append to `layout.css`:

```css
@media (width < 900px) {
  main {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    overflow-x: hidden;
  }

  #tracks {
    min-height: 0;
  }

  #track-scroller {
    flex-direction: row;
    align-items: center;
    overflow-x: auto;
    overflow-y: hidden;
    --scroll-fade-direction: to right;
    animation-timeline: scroll(self inline);
  }

  #tracks ol {
    flex-direction: row;
  }

  body:has(#ratio) #workspace {
    grid-template-columns: 1fr;
  }
}

@media (width < 600px) {
  body:has(.item.is-selected) #tracks {
    display: none;
  }

  body:not(:has(.item.is-selected)) #workspace {
    display: none;
  }

  header .action-primary {
    display: none;
  }

  footer .action-primary {
    display: inline-flex;
  }
}
```

Add the footer action to `index.html` beside the log:

```html
  <footer>
    <div id="log"></div>
    <button id="render-playlist-compact" class="action-primary" type="button">Render</button>
  </footer>
```

Both `footer .action-primary` rules live in `layout.css`, not `components.css` — which region shows which copy of the action is a layout decision, and `components.css` must not name page regions. Add the default above the media queries:

```css
footer .action-primary {
  display: none;
}
```

Wire the compact button in `app.js` beside the existing one:

```js
  document.getElementById("render-playlist-compact").addEventListener("click", () => renderRunner.start());
```

- [ ] **Step 4: Add the container query**

In `components.css`, add `container-type: inline-size;` to `.field-body`, and replace the `:has(.thumbnail)` direction switch with a container condition:

```css
.field-body {
  container-type: inline-size;
}

@container (width < 20rem) {
  .field-body:has(.thumbnail) {
    flex-direction: column;
    align-items: stretch;
  }
}
```

- [ ] **Step 5: Run it at three widths to verify it passes**

Run:
```bash
for size in "1440 900" "800 900" "390 844"; do
  set -- $size
  node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
    examples/media-processing/youtube-to-playlist-video/ui --width=$1 --height=$2
done
```
Expected: every run exits 0.

- [ ] **Step 6: Capture the portrait screenshot**

```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui \
  --width=390 --height=844 --screenshot=../../../../../tmp-portrait.png
```
Confirm the layout is usable at phone width, then delete the file. This is the layout the X post's portrait video uses.

- [ ] **Step 7: Commit**

```bash
git add examples/media-processing/youtube-to-playlist-video/ui
git commit -F - <<'EOF'
Lay the UI out for narrow viewports

There was no `@media` or `@container` rule anywhere, and `main`'s two-column
grid has a floor of `13rem + 16rem`, so anything under 464px scrolled a desktop
layout sideways. Below 900px the list lies down as a horizontal rail above the
workspace; below 600px the two alternate and the primary action moves to the
footer for thumb reach.

`.field-body` was already adapting by proxy through `:has(.thumbnail)`; that
becomes a real container query, which is what it was approximating.
EOF
```

---

## Task 7: Icons from Lucide

**Files:**
- Modify: `examples/media-processing/youtube-to-playlist-video/ui/src/icons.js`
- Modify: `examples/media-processing/youtube-to-playlist-video/ui/styles/components.css` (`.icon` stroke width)
- Test: `~/.claude/skills/model-showcase/assets/checks.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ICONS` keyed by the same five names (`remove`, `revert`, `add`, `check`, `chevron`) with a `viewBox` of `0 0 24 24` and Lucide path data. `icon(name)` keeps its signature and still returns an `<svg class="icon" aria-hidden="true">` sized 16×16.

Lucide ships 24×24 at `stroke-width: 2`. Rendered at 16px that is 1.33px of stroke, heavier than the current hand-drawn 1px. `.icon` moves to `stroke-width: 1.5`, which renders at 1px, preserving the current optical weight.

Source icons: `remove` → `x`, `revert` → `rotate-ccw`, `add` → `plus`, `check` → `check`, `chevron` → `chevron-down`. Take the path data from https://lucide.dev for each, verbatim.

- [ ] **Step 1: Write the failing test**

Append to `CHECKS`:

```js
  {
    name: "icons use a 24-unit viewBox",
    run: async () => {
      const { ICONS } = await import("./src/icons.js");
      const wrong = Object.entries(ICONS)
        .filter(([ , spec ]) => spec.viewBox !== "0 0 24 24")
        .map(([ name ]) => name);

      return wrong.length === 0 ? true : wrong.join(", ");
    },
  },
  {
    name: "icons still render at 16px",
    run: async () => {
      const { icon } = await import("./src/icons.js");
      const svg = icon("check");

      if (svg.getAttribute("width") !== "16") return `width ${svg.getAttribute("width")}`;
      if (svg.getAttribute("aria-hidden") !== "true") return "missing aria-hidden";

      return true;
    },
  },
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: `FAIL icons use a 24-unit viewBox — remove, revert, add, check, chevron`.

- [ ] **Step 3: Fetch the path data**

Open https://lucide.dev and copy the `d` attribute of each path for `x`, `rotate-ccw`, `plus`, `check`, `chevron-down`. Some Lucide icons are two paths; keep both, as separate entries in a `paths` array.

- [ ] **Step 4: Rewrite `icons.js`**

```js
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function definition(paths) {
  return { paths: paths, viewBox: "0 0 24 24" };
}

export const ICONS = {
  remove: definition([ /* lucide x */ ]),
  revert: definition([ /* lucide rotate-ccw */ ]),
  add: definition([ /* lucide plus */ ]),
  check: definition([ /* lucide check */ ]),
  chevron: definition([ /* lucide chevron-down */ ]),
};

export function icon(name) {
  const spec = ICONS[name];

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", spec.viewBox);
  svg.setAttribute("aria-hidden", "true");

  spec.paths.forEach((data) => {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", data);

    svg.appendChild(path);
  });

  return svg;
}
```

Replace each `/* lucide … */` with the real path strings. Leave no comments in the committed file.

- [ ] **Step 5: Adjust the stroke weight**

In `components.css`, change `.icon { stroke-width: 1; }` to `stroke-width: 1.5;`.

- [ ] **Step 6: Run it to verify it passes**

Run:
```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: all checks `PASS`.

- [ ] **Step 7: Confirm the icons look right**

```bash
node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui \
  --screenshot=$SCRATCH/shot-icons.png
```
Confirm the chevron and the remove glyph match their previous weight, then delete the file.

- [ ] **Step 8: Commit**

```bash
git add examples/media-processing/youtube-to-playlist-video/ui
git commit -F - <<'EOF'
Take icon geometry from Lucide instead of drawing it

`ICONS` carried five hand-drawn 16x16 paths. Lucide (ISC) supplies the same
five as `x`, `rotate-ccw`, `plus`, `check`, and `chevron-down` on a 24-unit
grid with consistent joins and terminals. The svg still renders at 16px; the
`.icon` stroke moves from `1` to `1.5` so that 24-unit geometry at 16px lands
on the same 1px optical weight.
EOF
```

---

## Task 8: `ui-house-style` — tokens and layout

**Files:**
- Create: `~/.claude/skills/ui-house-style/SKILL.md`
- Create: `~/.claude/skills/ui-house-style/references/tokens.md`
- Create: `~/.claude/skills/ui-house-style/references/layout.md`
- Create: `~/.claude/skills/ui-house-style/check-rules.mjs`

**Interfaces:**
- Consumes: the corrected reference UI from Tasks 2–7.
- Produces: `check-rules.mjs`, run as `node ~/.claude/skills/ui-house-style/check-rules.mjs <reference-ui-dir>`, exiting non-zero when a claim in the references does not match the reference UI. Later tasks extend its `RULES` array.

The rules documents make factual claims about a real directory. `check-rules.mjs` is what stops them drifting — it is the test for prose.

**Source text:** spec sections "Skill C: `ui-house-style`" → "Process in SKILL.md", "Rule form: ban, replacement, reason", "`tokens.md`". Every measured ratio and every token value the prose asserts is already written there; copy them rather than re-deriving.

- [ ] **Step 1: Write the failing test**

Create `~/.claude/skills/ui-house-style/check-rules.mjs`:

```js
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const reference = resolve(process.argv[2]);

async function fencedBlock(referenceFile, language) {
  const source = await readFile(join(here, "references", referenceFile), "utf8");
  const match = source.match(new RegExp("```" + language + "\\n([\\s\\S]*?)```"));

  return match ? match[1] : null;
}

const RULES = [
  {
    name: "tokens.md embeds base.css verbatim",
    run: async () => {
      const quoted = await fencedBlock("tokens.md", "css");
      const actual = await readFile(join(reference, "styles/base.css"), "utf8");

      return quoted === actual ? true : "the embedded block differs from styles/base.css";
    },
  },
  {
    name: "layout.md states both breakpoints",
    run: async () => {
      const source = await readFile(join(here, "references/layout.md"), "utf8");
      const missing = [ "900px", "600px" ].filter((value) => !source.includes(value));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
];

let failed = false;

for (const rule of RULES) {
  const outcome = await rule.run();

  console.log((outcome === true ? "PASS " : "FAIL ") + rule.name + (outcome === true ? "" : " — " + outcome));
  if (outcome !== true) failed = true;
}

process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
node ~/.claude/skills/ui-house-style/check-rules.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: both rules fail; `references/tokens.md` does not exist.

- [ ] **Step 3: Write `SKILL.md`**

Front matter `name: ui-house-style`, `description: Use when writing any web UI for a model-compose example — supplies the house design tokens, layout skeleton, component vocabulary, and the bans that keep generated frontends from defaulting to generic AI styling.`

Body: one page only. The four-step process (tokens, layout, components, self-critique), a pointer to each reference file with one line on when to read it, and the self-critique checklist from the spec.

- [ ] **Step 4: Write `references/tokens.md`**

Embed the current `styles/base.css` in a ```css fence, byte for byte. It must be the **first** ```css fence in the file — `check-rules.mjs` reads the first one — so any other CSS example in this file comes after it. Then the scale rule, the component-intrinsic exception (`2.5rem` thumbnail, `1.75rem` icon button, `0.875rem` slider thumb), the accent split with the measured ratios (`--accent` 3.61:1 as text, `--accent-text` 4.62:1), and the rule that `--disabled` is for disabled controls and never for instructional text.

- [ ] **Step 5: Write `references/layout.md`**

The three-region skeleton, the `clamp(13rem, 22vw, 20rem)` list column, the footer's `:not(:has(...))` self-hiding with `@starting-style`, the scroll-fade mechanism (`@property` plus `animation-timeline: scroll(self block|inline)`), the two breakpoints with the layout each produces, and the note that breakpoints are not tokenised because custom properties do not work in `@media` conditions.

- [ ] **Step 6: Run it to verify it passes**

Run:
```bash
node ~/.claude/skills/ui-house-style/check-rules.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: both rules `PASS`.

- [ ] **Step 7: Commit the plan progress**

The skill itself is outside the repository and is not committed. Record progress by checking the boxes in this plan file:

```bash
git add docs/superpowers/plans/2026-09-11-model-showcase-skills.md
git commit -m "Mark Task 8 complete in the model showcase plan"
```

---

## Task 9: `ui-house-style` — components, CSS, JavaScript

**Files:**
- Create: `~/.claude/skills/ui-house-style/references/components.md`
- Create: `~/.claude/skills/ui-house-style/references/css-patterns.md`
- Create: `~/.claude/skills/ui-house-style/references/js-patterns.md`
- Modify: `~/.claude/skills/ui-house-style/check-rules.mjs`

**Interfaces:**
- Consumes: `check-rules.mjs` and its `RULES` array from Task 8.
- Produces: three more reference files and three more rules.

**Source text:** spec sections "`css-patterns.md`", "`js-patterns.md`", "`components.md`". The full ban list, the focus rule with its element table and three CSS blocks, and the JavaScript rules are written out there verbatim.

- [ ] **Step 1: Write the failing test**

Append to `RULES` in `check-rules.mjs`:

```js
  {
    name: "components.md names only classes that exist",
    run: async () => {
      const source = await readFile(join(here, "references/components.md"), "utf8");
      const actual = await readFile(join(reference, "styles/components.css"), "utf8");
      const named = [ ...new Set([ ...source.matchAll(/`(\.[a-z][\w-]*)`/g) ].map((match) => match[1])) ];
      const missing = named.filter((name) => !actual.includes(name));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
  {
    name: "css-patterns.md writes every ban as ban, replacement, reason",
    run: async () => {
      const source = await readFile(join(here, "references/css-patterns.md"), "utf8");
      const bans = [ ...source.matchAll(/^✗ .*$/gm) ].length;
      const replacements = [ ...source.matchAll(/^→ .*$/gm) ].length;
      const reasons = [ ...source.matchAll(/^Why: .*$/gm) ].length;

      if (bans === 0) return "no bans found";

      return bans === replacements && bans === reasons
        ? true
        : `${bans} bans, ${replacements} replacements, ${reasons} reasons`;
    },
  },
  {
    name: "js-patterns.md bans the habits the reference avoids",
    run: async () => {
      const source = await readFile(join(here, "references/js-patterns.md"), "utf8");
      const required = [ "innerHTML", "export default", "replaceChildren", "hidden", "class" ];
      const missing = required.filter((term) => !source.includes(term));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
node ~/.claude/skills/ui-house-style/check-rules.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: three new `FAIL` lines about missing files.

- [ ] **Step 3: Write `references/components.md`**

Markup and behaviour for each widget in the vocabulary from Task 5: `.field`, `.field-body`, `.field-line`, `.dropdown`, `.dropdown-menu`, `.dropdown-option`, `.item`, `.item-label`, `.item-remove`, `.action-primary`, `.action-add`, `.action-cancel`, `.action-resume`, `.caption-warning`, `.status-message`, `.status-trailing`, `.thumbnail`, `.color-picker-swatch`.

Include the icon rule: take SVG from Lucide (ISC), copy only path data into `ICONS`, 24-unit viewBox rendered at 16px, `stroke-width: 1.5`, `fill: none`, `aria-hidden="true"`, and do not mix in a filled set.

Include the truncation rule: add the selector to the existing shared list rather than repeating `overflow`, `text-overflow`, `white-space`.

Name only class names that exist in the current `components.css` — `check-rules.mjs` rejects any backticked `.class` it cannot find there. Superseded names such as `.track` belong in `css-patterns.md`'s ban list, not here.

- [ ] **Step 4: Write `references/css-patterns.md`**

Every ban in the three-line form the test enforces:

```
✗ box-shadow for elevation
→ Express depth with --background-panel and --radius-lg.
Why: this UI has no light-source metaphor. Layers are surface brightness only.
```

Cover: `box-shadow`, decorative gradients, JS class toggling for state, popover libraries, scroll event listeners, per-component hover and focus declarations, ID selectors in `components.css`, domain nouns in `components.css`, and `outline: 0` without a replacement in the same block.

Then the focus rule in full — the one sentence, the element table, and the three CSS blocks from the spec — plus the reduced-motion block and the responsive split (`@media` for the skeleton, `@container` for components).

- [ ] **Step 5: Write `references/js-patterns.md`**

Named exports only, no `export default`, no `class`, `createX()` factories returning object literals, `document.createElement` plus `Object.assign` instead of `innerHTML`, `replaceChildren()` for updates, the `hidden` attribute instead of `style.display`, spelled-out identifiers, no comments, declaration / work / return paragraphs, one file one concern.

- [ ] **Step 6: Run it to verify it passes**

Run:
```bash
node ~/.claude/skills/ui-house-style/check-rules.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: all rules `PASS`.

- [ ] **Step 7: Commit the plan progress**

```bash
git add docs/superpowers/plans/2026-09-11-model-showcase-skills.md
git commit -m "Mark Task 9 complete in the model showcase plan"
```

---

## Task 10: `ui-house-style` — streaming

**Files:**
- Create: `~/.claude/skills/ui-house-style/references/streaming.md`
- Modify: `~/.claude/skills/ui-house-style/check-rules.mjs`
- Modify: `~/.claude/skills/ui-house-style/SKILL.md`

**Interfaces:**
- Consumes: `check-rules.mjs` from Task 9.
- Produces: the streaming vocabulary. `SKILL.md` gains a line telling the reader to load this file whenever the model's I/O mode is streaming.

Neither reference example streams, so this file has no code to extract from and is the one place where the rules are written from first principles rather than from the reference UI. The test therefore checks completeness against the spec's numbered list rather than against code.

**Source text:** spec section "`streaming.md`" — fourteen numbered rules, eight for output, five for input, one common.

- [ ] **Step 1: Write the failing test**

Append to `RULES`:

```js
  {
    name: "streaming.md covers all fourteen rules",
    run: async () => {
      const source = await readFile(join(here, "references/streaming.md"), "utf8");
      const required = [
        "overflow-y", "pinned", "--text-caption", "translate", "tabular-nums",
        "requestAnimationFrame", "aria-live", "showProgress", "user gesture",
        "red dot", "<meter>", "label", "WebAudio", "prefers-reduced-motion",
      ];
      const missing = required.filter((term) => !source.includes(term));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
node ~/.claude/skills/ui-house-style/check-rules.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: `FAIL streaming.md covers all fourteen rules` with an ENOENT for the missing file.

- [ ] **Step 3: Write `references/streaming.md`**

The fourteen rules from the spec, each in the ban / replacement / reason form where it is a ban and as a plain instruction where it is not. Open with why streaming needs its own file: it is a layout that changes along a time axis, and batch entry animations applied to ten-per-second arrivals induce motion sickness.

- [ ] **Step 4: Point `SKILL.md` at it**

Add to the reference list in `SKILL.md`: read `streaming.md` whenever the model produces incremental output or consumes live input. Add to the four-step process, at step 2: decide batch or streaming before choosing a layout, because the two produce different skeletons.

- [ ] **Step 5: Run it to verify it passes**

Run:
```bash
node ~/.claude/skills/ui-house-style/check-rules.mjs \
  examples/media-processing/youtube-to-playlist-video/ui
```
Expected: all rules `PASS`.

- [ ] **Step 6: Commit the plan progress**

```bash
git add docs/superpowers/plans/2026-09-11-model-showcase-skills.md
git commit -m "Mark Task 10 complete in the model showcase plan"
```

---

## Task 11: `model-showcase` — research and compose

**Files:**
- Create: `~/.claude/skills/model-showcase/SKILL.md`
- Create: `~/.claude/skills/model-showcase/references/research.md`
- Create: `~/.claude/skills/model-showcase/references/compose.md`

**Interfaces:**
- Consumes: `ui-house-style`, invoked from step 4 of this skill's process.
- Produces: the six-step process with human gates at steps 3 and 6.

**Source text:** spec sections "Skill B: `model-showcase`" → "Six steps, two human gates", "`research.md`", "`compose.md`", "Directory naming".

- [ ] **Step 1: Write `SKILL.md`**

Front matter `name: model-showcase`, `description: Use when building a model-compose showcase example that introduces one model — researches the model, maps it onto a model-compose task, gates on which demo angle to build, then generates the compose file, the web UI, the fixtures, and the three READMEs.`

Body: the six-step table from the spec, and the loop discipline stated plainly — the generated example is never hand-patched; anything unsatisfactory is fixed in this skill's prose or in `ui-house-style` and the example is regenerated whole.

- [ ] **Step 2: Write `references/research.md`**

Source order: Hugging Face model card, project GitHub README, arXiv paper, Transformers model doc.

Required fields: variants and parameter counts, licence, input and output shape, streaming or batch or both, hardware floor, the one distinguishing mechanism, withdrawal or restriction history.

The licence gate: stop and ask for anything other than MIT or Apache-2.0, with the VibeVoice TTS withdrawal as the worked example — weights pulled 2025-09-04, repository restored 2025-09-05 without the TTS code.

The no-guessing rule: parameter counts, context lengths and benchmark figures need a source URL or the field is marked `needs verification`. Worked example: VibeVoice-ASR is listed as 7B on GitHub, 9B on the `microsoft/VibeVoice-ASR` card, and 8B on the `microsoft/VibeVoice-ASR-HF` card — three official figures for one model.

The usage-scope gate, separate from the licence gate: record verbatim any statement restricting how the authors want the model used. VibeVoice is MIT and its README still says "This model is intended for research and development purposes only." It does not stop the work; it is a sentence `report.md` and `social.md` then require the output to carry.

Published leaderboard numbers go in the research table with their datasets, as a baseline for the three-machine measurement — including the unflattering ones. VibeVoice-ASR averages 7.77% WER at RTFx 51.80 and its worst row is AMI at 17.20%, which is meeting audio, which is this example's own subject.

The I/O mode field feeds step 3: a family with both a batch and a streaming checkpoint splits the demo angles along that line first.

- [ ] **Step 3: Write `references/compose.md`**

The 35 model tasks available under `src/mindor/core/component/services/model/tasks/`, how to pick the nearest existing example under `examples/model-tasks/` and copy its component block, `controller.webui.driver: static` with `static_dir: ./ui`, and the requirement that every workflow the UI calls carries an `id`.

The verbatim copy instruction for `ui/src/websocket-client.js`, with the reason: `stream_pull` backpressure, post-reconnect task resubscription and binary chunk framing are the model-compose WebSocket protocol, not design decisions.

The note that file drop needs no new work because `streamFile(file)` already returns the `__variable__` stream descriptor the server pulls from.

The directory naming rule: verb-object, because an example sells a capability rather than a model. Evidence: four of the six existing showcase directories are verb-object.

- [ ] **Step 4: Verify by dry run**

Run the skill's steps 1 and 2 by hand against `microsoft/VibeVoice-ASR` and confirm the output is a filled research table with a source URL per field and a named base example. Expected base: `examples/model-tasks/speech-to-text-vibevoice`.

- [ ] **Step 5: Commit the plan progress**

```bash
git add docs/superpowers/plans/2026-09-11-model-showcase-skills.md
git commit -m "Mark Task 11 complete in the model showcase plan"
```

---

## Task 12: `model-showcase` — READMEs and verification

**Files:**
- Create: `~/.claude/skills/model-showcase/references/readme.md`
- Create: `~/.claude/skills/model-showcase/references/verify.md`

**Interfaces:**
- Consumes: the harness from Task 1, already present under `assets/`.
- Produces: the documentation and verification halves of step 4 and step 5.

**Source text:** spec sections "`readme.md`", "`verify.md`", and "Two verification loops" for the fixture lifecycle.

- [ ] **Step 1: Write `references/readme.md`**

Three READMEs per example — `README.md`, `README.ko.md`, `README.zh-cn.md` — following the structure `examples/README.md` documents and the section order the existing examples use: overview, preparation and prerequisites, environment configuration, how to run, API, input parameters, how it works.

The index entry: `examples/README.md` carries one line per showcase example at lines 177–181, in the form `- [name](./showcase/name/) — one-line description`. An example missing from that list is effectively invisible, so adding the line is part of step 4, not an afterthought.

- [ ] **Step 2: Write `references/verify.md`**

The fast loop: copy `assets/test.html` and `assets/checks.js` into the example's `ui/`, write a `fixture.json` matching the workflow's output shape, run `node assets/ui-check.mjs <example>/ui` at `1440×900`, `800×900` and `390×844`, then capture a screenshot at each.

The checks every generated example must pass: the acceptance list from the spec, expressed as `CHECKS` entries. Read `~/.claude/skills/model-showcase/assets/checks.js` as it stands after Task 7 and carry those entries forward — do not reconstruct them from the code blocks in Tasks 2–7, which are each a snapshot of one moment in a file seven tasks edit in turn.

Two habits from that file are worth stating as rules, because both were defects it had to be corrected for: a check that cannot distinguish "the thing I measure is absent" from "the thing I measure is fine" is worse than no check, and a check whose red state has never been observed is not yet a check.

The fixture lifecycle: hand-written from the model card's example output on the first pass, replaced with one saved real run after step 6.

The Chrome rule, stated plainly: every invocation is self-exiting via `--dump-dom` or `--screenshot` with `--virtual-time-budget`. Never kill Chrome by image name — that closes the user's own browser.

Add `ui/test.html`, `ui/checks.js` and `ui/fixture.json` to the generated example's `.gitignore`.

- [ ] **Step 3: Verify the references are self-consistent**

Run:
```bash
grep -c "ui-check.mjs" ~/.claude/skills/model-showcase/references/verify.md
ls ~/.claude/skills/model-showcase/assets/
```
Expected: a non-zero count, and `serve.mjs`, `ui-check.mjs`, `test.html`, `checks.js` all present.

- [ ] **Step 4: Commit the plan progress**

```bash
git add docs/superpowers/plans/2026-09-11-model-showcase-skills.md
git commit -m "Mark Task 12 complete in the model showcase plan"
```

---

## Task 13: Generate the example and iterate

**Files:**
- Create: `examples/showcase/transcribe-long-meeting/model-compose.yml`
- Create: `examples/showcase/transcribe-long-meeting/ui/**`
- Create: `examples/showcase/transcribe-long-meeting/README.md`, `README.ko.md`, `README.zh-cn.md`
- Create: `examples/showcase/transcribe-long-meeting/.gitignore`
- Modify: `examples/README.md:177-181`

**Interfaces:**
- Consumes: both skills, and Task 15 — the harness must reach a true phone viewport before this task's screenshots mean anything.
- Produces: the example. New modules beyond the house vocabulary: `dropzone.js`, `timeline.js`, `segments.js`, `hotwords.js`.

This task is the loop, not a single pass. Each iteration deletes the example and regenerates it whole.

- [ ] **Step 1: Run the skill**

Invoke `model-showcase` with `microsoft/VibeVoice-ASR`. At the step 3 gate, choose the speaker-coloured timeline. Base: `examples/model-tasks/speech-to-text-vibevoice`. Input: local file drop only.

- [ ] **Step 2: Write the fixture**

`ui/fixture.json` matching the workflow output shape. **Which shape that is, is unresolved
and Task 14 settles it.** This repository's `speech-to-text-vibevoice` README documents
`{ text, start_time, end_time, speaker_id }`, while the Transformers model doc shows the
model emitting — and `processor.decode(..., return_format="parsed")` returning —
`{ Start, End, Speaker, Content }`. Write the fixture in the README's shape, and put a
single adapter function between the fixture and the render functions so that Task 14
changes one function rather than every module:

```json
{
  "transcription": [
    { "text": "Let's start with the quarterly numbers.", "start_time": 0.0, "end_time": 2.8, "speaker_id": 0 },
    { "text": "Revenue is up eleven percent.", "start_time": 3.1, "end_time": 5.4, "speaker_id": 1 },
    { "text": "That includes the VibeVoice line?", "start_time": 5.6, "end_time": 7.2, "speaker_id": 0 }
  ]
}
```

- [ ] **Step 3: Run the fast loop**

```bash
for size in "1440 900" "800 900" "390 844"; do
  set -- $size
  node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
    examples/showcase/transcribe-long-meeting/ui --width=$1 --height=$2
done
```
Expected: exit 0 at every width.

- [ ] **Step 4: Run the acceptance check**

Place the generated `ui/` beside `examples/media-processing/youtube-to-playlist-video/ui/` and confirm each item:

- `base.css` tokens identical in name and scale
- one file, one concern
- no framework, no build step
- declaration / work / return paragraphs
- icons from Lucide, not hand-drawn
- the screenshot reads as the same family

- [ ] **Step 5: Iterate**

For every failure, edit the responsible skill's prose — never the generated files. Then:

```bash
rm -rf examples/showcase/transcribe-long-meeting
```

and return to Step 1. Repeat until Steps 3 and 4 both pass on a fresh generation.

- [ ] **Step 6: Add the index entry**

In `examples/README.md`, after line 181:

```markdown
- [transcribe-long-meeting](./showcase/transcribe-long-meeting/) — Hour-long transcription with speakers and timestamps via VibeVoice-ASR
```

- [ ] **Step 7: Commit**

```bash
git add examples/showcase/transcribe-long-meeting examples/README.md
git commit -F - <<'EOF'
Add the `transcribe-long-meeting` showcase

Generated by the `model-showcase` skill from `microsoft/VibeVoice-ASR`, not
written by hand. The component block comes from
`examples/model-tasks/speech-to-text-vibevoice`; `webui.driver` moves from
`gradio` to `static` and the workflow gains an `id` so the page can reach it
over `run_workflow`.

The screen is a speaker-coloured timeline over a segment list, with a hotword
field feeding `context_info`. It shows what a 7.5 Hz continuous tokeniser buys:
an hour of audio in one pass, with who and when decoded alongside what.
EOF
```

---

## Task 14: Real run

**Files:**
- Modify: `examples/showcase/transcribe-long-meeting/ui/fixture.json`
- Modify: `examples/showcase/transcribe-long-meeting/README.md`, `README.ko.md`, `README.zh-cn.md` (any figure marked `needs verification`)

**Interfaces:**
- Consumes: the example from Task 13.
- Produces: a fixture holding real output, and every `needs verification` field resolved.

- [ ] **Step 1: Start the example**

```bash
cd examples/showcase/transcribe-long-meeting
model-compose up
```
Expected: the first run downloads roughly 14 GB and creates `.venv/vibevoice`. The static UI is at `http://127.0.0.1:8081`.

- [ ] **Step 2: Transcribe a real file**

Drop a multi-speaker recording of at least ten minutes onto the page. Confirm the timeline paints one colour per speaker, the segment list fills, and a hotword changes the recognition of the term it names.

- [ ] **Step 3: Resolve the open figures**

Settle the parameter count that the research step marked `needs verification` — GitHub says 7B, the `microsoft/VibeVoice-ASR` card says 9B, and the `microsoft/VibeVoice-ASR-HF` card says 8B — by reading what the loaded checkpoint reports. Update all three READMEs.

Settle the output schema the same way. Record which field names the workflow actually returns — the README's `{ text, start_time, end_time, speaker_id }` or the Transformers doc's `{ Start, End, Speaker, Content }` — rewrite the adapter function from Task 13 Step 2 against them, and correct whichever document was wrong in the same commit.

- [ ] **Step 4: Replace the fixture with real output**

Save one run's `transcription` array over `ui/fixture.json`, trimmed to a handful of segments.

- [ ] **Step 5: Re-run the fast loop against real data**

```bash
for size in "1440 900" "800 900" "390 844"; do
  set -- $size
  node ~/.claude/skills/model-showcase/assets/ui-check.mjs \
    examples/showcase/transcribe-long-meeting/ui --width=$1 --height=$2
done
```
Expected: exit 0 at every width. Real segment text is longer than the hand-written fixture and is the first genuine test of truncation and wrapping.

- [ ] **Step 6: Commit**

```bash
git add examples/showcase/transcribe-long-meeting
git commit -F - <<'EOF'
Settle the figures `transcribe-long-meeting` could not source

The research step could not reconcile the checkpoint size -- GitHub says 7B,
the Hugging Face card says 9B -- and marked it `needs verification` rather than
guessing. A real run settles it, and the fixture moves from the model card's
example output to a saved run, so the fast loop renders real segment lengths.
EOF
```

---

## Task 15: Capture at a true phone viewport

**Runs after Task 7 and before Task 13.** It is numbered last only so that the earlier numbers, which the ledger and the extracted briefs already reference, stay stable.

**Files:**
- Modify: `.claude/skills/model-showcase/assets/ui-check.mjs`

**Interfaces:**
- Consumes: the harness from Task 1.
- Produces: `--width` and `--height` that mean what they say at any size, and screenshots that include fixed-position elements. Task 13 and the later `model-report` plan both depend on this.

Task 6 established the `< 600px` layout and its reviewer confirmed the harness cannot photograph it. Asking for `--width=390 --height=844` produces a page laid out at roughly 518px and then cropped to a 390px canvas: the reviewer's own run at those flags lost the RESOLUTION and FPS dropdowns and the entire footer action off the right edge. `position: fixed` elements are also absent from captures. The cause is `ui-check.mjs` passing the requested size straight to `--window-size` with no device-metrics override anywhere in the file.

Two consequences make this worth its own task rather than a deferred minor. The stated reason Task 6 exists at all is that a later stage needs a portrait demo video at phone width, and a pipeline that floors at 518px cannot produce one. And the `< 600px` breakpoint currently has exactly one width of automated coverage, at 518px, because the assertions run in a viewport that never goes narrower.

The assertions themselves are unaffected — they read the real iframe viewport and pass correctly at all three widths. This is a capture defect, not a layout defect.

- [ ] **Step 1: Write the failing test**

Append to `CHECKS` in `.claude/skills/model-showcase/assets/checks.js`:

```js
  {
    name: "the viewport is the width that was asked for",
    run: (frameDocument, frameWindow) => {
      const requested = Number(new URL(frameWindow.location.href).searchParams.get("expect-width"));

      if (!requested) return true;

      return Math.abs(frameWindow.innerWidth - requested) <= 1
        ? true
        : `innerWidth ${frameWindow.innerWidth} but ${requested} was requested`;
    },
  },
```

and have `ui-check.mjs` append `?expect-width=<width>` to the iframe's source so the check has something to compare against. A run that does not set the parameter skips the check rather than failing it, so the default desktop run is unaffected.

- [ ] **Step 2: Run it at 390 to verify it fails**

```bash
node .claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui --width=390 --height=844
```
Expected: `FAIL the viewport is the width that was asked for — innerWidth 518 but 390 was requested`, or whatever floor this machine's Chrome imposes.

- [ ] **Step 3: Make the requested size real**

`--window-size` is an operating-system window request and is subject to the platform's minimum window width, which is why it floors. The size that matters is the viewport, which is set through Chrome's device-metrics emulation rather than through the window.

Find the flag or mechanism that applies a device-metrics override in the headless mode this harness uses, and apply the requested width, height and a device scale factor of 1. Do not switch the harness to a CDP session that must be torn down by hand — every Chrome invocation here is self-exiting by design, and a session that outlives a crashed run is how a process gets left behind. If the only workable route is a CDP session, say so and stop rather than introducing one.

- [ ] **Step 4: Run it at all three widths to verify it passes**

```bash
for size in "1440 900" "800 900" "390 844"; do
  set -- $size
  node .claude/skills/model-showcase/assets/ui-check.mjs \
    examples/media-processing/youtube-to-playlist-video/ui --width=$1 --height=$2
done
```
Expected: exit 0 each time, with the new check passing rather than skipping at every width.

- [ ] **Step 5: Confirm the capture matches**

```bash
node .claude/skills/model-showcase/assets/ui-check.mjs \
  examples/media-processing/youtube-to-playlist-video/ui \
  --width=390 --height=844 --screenshot=$SCRATCH/portrait.png
```

Open the image. Every header dropdown must be present or deliberately scrolled out of view by the settings row's own horizontal scroll, and the footer action must be visible. Compare against the description in Task 6's report of what was previously lost, and say whether each item has returned.

- [ ] **Step 6: Confirm fixed-position elements are painted**

The dropdown menu uses the native popover API and is positioned `fixed`. Capture a screenshot with a menu open — driving it from the page is acceptable — and say whether it appears. If it still does not, report that as a remaining limitation rather than working around it; it constrains what the demo video can show.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/model-showcase/assets
git commit -m "Give the harness a real viewport instead of a window size"
```

---

## Out of scope for this plan

`model-report` — the benchmark harness change (`vram_bytes` on `SystemSample`), the three-machine runs, the report and the X post — is a separate plan. It depends on this plan's Task 14 having produced a working example and no earlier. Write it after Task 14 completes.
