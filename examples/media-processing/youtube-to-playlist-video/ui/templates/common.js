(function (global) {
  "use strict";

  const DEFAULT_RENDER_SETTINGS = global.DEFAULT_RENDER_SETTINGS;

  if (!DEFAULT_RENDER_SETTINGS) {
    throw new Error("render-settings.js must be loaded before common.js");
  }

  const DEFAULT_TRACK_COLORS = global.DEFAULT_TRACK_COLORS;

  if (!DEFAULT_TRACK_COLORS) {
    throw new Error("track-colors.js must be loaded before common.js");
  }

  const SCREEN_RATIOS = global.SCREEN_RATIOS;

  if (!SCREEN_RATIOS) {
    throw new Error("ratios.js must be loaded before common.js");
  }

  const PREVIEW_MESSAGES = global.PREVIEW_MESSAGES;

  if (!PREVIEW_MESSAGES) {
    throw new Error("preview-protocol.js must be loaded before common.js");
  }

  const FALLBACK_RATIO = DEFAULT_RENDER_SETTINGS.ratio;
  const FALLBACK_FPS = DEFAULT_RENDER_SETTINGS.fps;
  const FALLBACK_DURATION_SECONDS = 60.0;

  const ROOT_FONT_DIVISOR = 45;

  const HOSTED_TRACK_KEYS = [
    "title",
    "artist",
    "track_index",
    "cover",
    "colors",
    "bandCount",
    "fps",
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function positiveSize(value) {
    const size = Number(value);
    return size > 0 ? size : null;
  }

  function mergeColorRoles(...layers) {
    return Object.assign({}, DEFAULT_TRACK_COLORS, ...layers.map((layer) => layer || {}));
  }

  function isFramed() {
    return global.parent !== global;
  }

  function nearestRatioName(aspect) {
    let nearestName = FALLBACK_RATIO;
    let nearestDistance = Infinity;

    Object.keys(SCREEN_RATIOS).forEach((name) => {
      const spec = SCREEN_RATIOS[name];
      const distance = Math.abs(spec.width / spec.height - aspect);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestName = name;
      }
    });

    return nearestName;
  }

  function pickScreen(outputWidth, outputHeight) {
    const width = positiveSize(outputWidth);
    const height = positiveSize(outputHeight);
    const name = width && height ? nearestRatioName(width / height) : FALLBACK_RATIO;
    const logical = SCREEN_RATIOS[name];

    return {
      ratio: name,
      orient: logical.orient,
      width: logical.width,
      height: logical.height,
      scale: width ? width / logical.width : 1,
    };
  }

  function sizeScreenToLogicalUnits(screenEl, spec) {
    const shortSide = Math.min(spec.width, spec.height);
    document.documentElement.style.fontSize = shortSide / ROOT_FONT_DIVISOR + "px";

    screenEl.style.setProperty("--screen-width", spec.width + "px");
    screenEl.style.setProperty("--screen-height", spec.height + "px");
    screenEl.style.width = spec.width + "px";
    screenEl.style.height = spec.height + "px";
    screenEl.style.transformOrigin = "0 0";
    screenEl.setAttribute("data-ratio", spec.ratio);
    screenEl.setAttribute("data-orient", spec.orient);
  }

  function scaleScreenToOutputResolution(screenEl, spec) {
    [document.documentElement, document.body].forEach((element) => {
      element.style.width = spec.width * spec.scale + "px";
      element.style.height = spec.height * spec.scale + "px";
      element.style.margin = "0";
      element.style.overflow = "hidden";
    });
    screenEl.style.transform = "scale(" + spec.scale + ")";
  }

  function createScreen(ctx) {
    const screenEl = document.getElementById("screen");
    const spec = ctx.screen;

    if (!screenEl) return spec;

    sizeScreenToLogicalUnits(screenEl, spec);
    if (ctx.isEngineDriven) scaleScreenToOutputResolution(screenEl, spec);

    return spec;
  }

  function hash(n) {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function loopedNoise(x, period) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const i0 = ((i % period) + period) % period;
    const i1 = (i0 + 1) % period;
    return hash(i0) * (1 - u) + hash(i1) * u;
  }

  function bandNoise(band, x, period) {
    return loopedNoise(x + band * 17.37, period);
  }

  function mockBandShape(band) {
    return Math.pow(0.85, band) + 0.08;
  }

  function buildMockSpectrum(bandCount, fps, duration) {
    const frames = [];

    const beatsPerLoop = Math.max(1, Math.round(duration / 0.5));
    const beatSeconds = duration / beatsPerLoop;
    const swellCyclesPerLoop = Math.max(1, Math.round(duration / 18));
    const swellHz = swellCyclesPerLoop / duration;
    const wobblePeriod = Math.max(4, Math.round(duration * 6));
    const flickerPeriod = Math.max(4, Math.round(duration * 26));
    const wobbleCellsPerSecond = wobblePeriod / duration;
    const flickerCellsPerSecond = flickerPeriod / duration;

    for (let frame = 0; frame < duration * fps; frame++) {
      const t = frame / fps;
      const row = [];

      const kickPhase = (t % beatSeconds) / beatSeconds;
      const hatPhase = ((t + beatSeconds / 2) % beatSeconds) / beatSeconds;
      const kick = Math.exp(-kickPhase * 9);
      const hat = Math.exp(-hatPhase * 14);
      const swell = 0.6 + 0.4 * (Math.sin(2 * Math.PI * swellHz * t) * 0.5 + 0.5);

      for (let band = 0; band < bandCount; band++) {
        const shape = mockBandShape(band);
        const kickPull = kick * Math.exp(-band / (bandCount * 0.3 + 1));
        const hatPull = hat * (1 - Math.exp(-band / (bandCount * 0.4 + 1))) * 0.6;
        const wobble = (bandNoise(band, t * wobbleCellsPerSecond, wobblePeriod) - 0.5) * 0.35 * shape;
        const flicker = (bandNoise(band, t * flickerCellsPerSecond + 500, flickerPeriod) - 0.5) * 0.12;

        const level = shape * swell * (0.35 + 0.65 * (kickPull + hatPull)) + wobble + flicker;
        row.push(clamp(level, 0, 1));
      }

      frames.push(row);
    }

    return { frames: frames, fps: fps, band_count: bandCount, duration: duration };
  }

  function hannWeight(offset, halfWidth) {
    return 0.5 - 0.5 * Math.cos((Math.PI * (offset + halfWidth)) / halfWidth);
  }

  function readSpectrum(spectrum) {
    const frames = spectrum.frames || [];
    const fps = spectrum.fps || FALLBACK_FPS;
    const bandCount = spectrum.band_count || (frames[0] ? frames[0].length : 0);
    const duration = spectrum.duration || FALLBACK_DURATION_SECONDS;

    function frameIndexAt(t) {
      return clamp(Math.round(t * fps), 0, frames.length - 1);
    }

    function frameAt(t) {
      return frames.length ? frames[frameIndexAt(t)] : null;
    }

    function smoothedFrameAt(t, seconds) {
      if (!frames.length || bandCount === 0) return null;

      const center = frameIndexAt(t);
      const halfWidth = Math.floor((fps * seconds) / 2);

      if (halfWidth < 1) return frames[center];

      const totals = new Array(bandCount).fill(0);
      let weightSum = 0;

      for (let offset = -halfWidth; offset <= halfWidth; offset++) {
        const index = center + offset;
        if (index < 0 || index >= frames.length) continue;

        const weight = hannWeight(offset, halfWidth);
        const frame = frames[index];

        for (let band = 0; band < bandCount; band++) totals[band] += (frame[band] || 0) * weight;
        weightSum += weight;
      }

      if (weightSum === 0) return frames[center];

      return totals.map((total) => total / weightSum);
    }

    return {
      duration: duration,
      fps: fps,
      bandCount: bandCount,
      frames: frames,
      frameAt: frameAt,
      smoothedFrameAt: smoothedFrameAt,
    };
  }

  function synthesizeHostedProps(template) {
    return {
      title: template.title,
      artist: template.artist,
      track_index: template.track_index,
      cover: template.cover,
      colors: mergeColorRoles(template.colors),
      spectrum: buildMockSpectrum(
        template.bandCount,
        template.fps || FALLBACK_FPS,
        template.duration || FALLBACK_DURATION_SECONDS
      ),
    };
  }

  function screenFor(props) {
    return pickScreen(props.width, props.height);
  }

  function createContext(mock) {
    const template = mock || {};
    const isEngineDriven = !!global.__renderer;

    if (!isEngineDriven) {
      global.__renderer = { props: synthesizeHostedProps(template) };
    }

    const props = global.__renderer.props || {};

    return Object.assign(
      {
        isEngineDriven: isEngineDriven,
        screen: screenFor(props),
        props: props,
        colors: mergeColorRoles(template.colors, props.colors),
      },
      readSpectrum(props.spectrum || {})
    );
  }

  function requestPropsFromHost() {
    if (!isFramed()) return Promise.resolve(null);

    return new Promise((resolve) => {
      function onMessage(event) {
        if (!event.data || event.data.type !== PREVIEW_MESSAGES.props) return;
        global.removeEventListener("message", onMessage);
        resolve(event.data.props || {});
      }

      global.addEventListener("message", onMessage);
      global.parent.postMessage({ type: PREVIEW_MESSAGES.ready }, "*");
    });
  }

  function withHostedTrack(template, hosted) {
    const merged = Object.assign({}, template);
    HOSTED_TRACK_KEYS.forEach((key) => {
      if (key in hosted) merged[key] = hosted[key];
    });
    return merged;
  }

  async function createHostedContext(mock) {
    const hosted = await requestPropsFromHost();
    if (!hosted) return createContext(mock);

    const ctx = createContext(withHostedTrack(mock || {}, hosted));

    if (hosted.width && hosted.height) {
      ctx.props.width = hosted.width;
      ctx.props.height = hosted.height;
      ctx.screen = pickScreen(hosted.width, hosted.height);
    }

    return ctx;
  }

  function applyColors(element, colors) {
    Object.keys(colors || {}).forEach((role) => {
      if (colors[role] != null) element.style.setProperty("--" + role, colors[role]);
    });
  }

  function loadImage(url, crossOrigin) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      if (crossOrigin) image.crossOrigin = crossOrigin;
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("failed to load image: " + url));
      image.src = url;
    });
  }

  function averageColor(image) {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;

    const context = probe.getContext("2d");
    context.drawImage(image, 0, 0, 1, 1);

    try {
      const pixel = context.getImageData(0, 0, 1, 1).data;
      return { r: pixel[0], g: pixel[1], b: pixel[2] };
    } catch (canvasIsTainted) {
      return null;
    }
  }

  function superSample(canvas, factor) {
    const width = canvas.width;
    const height = canvas.height;

    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * factor);
    canvas.height = Math.round(height * factor);

    return {
      width: width,
      height: height,
      apply: (context) => context.setTransform(factor, 0, 0, factor, 0, 0),
    };
  }

  function centerBodyInViewport() {
    [document.documentElement, document.body].forEach((element) => {
      element.style.width = "100%";
      element.style.height = "100%";
      element.style.overflow = "hidden";
    });

    document.body.style.display = "flex";
    document.body.style.alignItems = "center";
    document.body.style.justifyContent = "center";
    document.body.style.background = "#000";
  }

  function fitToWindow(spec) {
    const screenEl = document.getElementById("screen");
    if (!screenEl) return;

    centerBodyInViewport();

    screenEl.style.flex = "0 0 auto";
    screenEl.style.transformOrigin = "center center";

    function scaleToFit() {
      const scale = Math.min(window.innerWidth / spec.width, window.innerHeight / spec.height);
      screenEl.style.transform = "scale(" + scale + ")";
    }

    scaleToFit();
    window.addEventListener("resize", scaleToFit);
  }

  function publishRendererContract(duration, seek) {
    global.__renderer = global.__renderer || {};
    Object.assign(global.__renderer, { duration: duration, seek: seek });
  }

  function redrawOnHostColorChange(ctx, redraw) {
    global.addEventListener("message", (event) => {
      if (!event.data || event.data.type !== PREVIEW_MESSAGES.colors) return;

      const screenEl = document.getElementById("screen");
      Object.assign(ctx.colors, event.data.colors || {});
      if (screenEl) applyColors(screenEl, ctx.colors);
      redraw(0);
    });
  }

  function playSelfDrivenLoop(ctx, seek) {
    const startedAt = performance.now();

    (function loop(now) {
      seek(((now - startedAt) / 1000) % ctx.duration);
      requestAnimationFrame(loop);
    })(startedAt);
  }

  function start(ctx, draw) {
    const progressFill = document.getElementById("progress-fill");

    createScreen(ctx);

    function seek(t) {
      if (progressFill) {
        const progress = ctx.duration > 0 ? Math.min(1, t / ctx.duration) : 0;
        progressFill.style.width = (progress * 100).toFixed(2) + "%";
      }
      draw(t, ctx);
    }

    seek(0);
    publishRendererContract(ctx.duration, seek);

    if (isFramed()) redrawOnHostColorChange(ctx, seek);

    if (!ctx.isEngineDriven) {
      fitToWindow(ctx.screen);
      playSelfDrivenLoop(ctx, seek);
    }
  }

  global.Renderer = {
    SCREEN_RATIOS: SCREEN_RATIOS,
    pickScreen: pickScreen,
    createScreen: createScreen,
    createContext: createContext,
    createHostedContext: createHostedContext,
    applyColors: applyColors,
    loadImage: loadImage,
    averageColor: averageColor,
    superSample: superSample,
    start: start,
  };
})(window);
