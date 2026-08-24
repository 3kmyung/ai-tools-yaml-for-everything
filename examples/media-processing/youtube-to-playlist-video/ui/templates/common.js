(function (global) {
  "use strict";

  const STARTUP_FAILURE_DURATION_SECONDS = 1.0;

  const isEngineDrivenPage = !!global.__renderer;

  function failStartup(reason) {
    const message = reason && reason.message ? reason.message : String(reason);

    if (isEngineDrivenPage) {
      global.__renderer.duration = global.__renderer.duration || STARTUP_FAILURE_DURATION_SECONDS;
      global.__renderer.seek = () => {
        throw new Error("template failed to start: " + message);
      };
    }

    throw reason;
  }

  function startTemplate(body) {
    return Promise.resolve().then(body).catch(failStartup);
  }

  const DEFAULT_RENDER_SETTINGS = global.DEFAULT_RENDER_SETTINGS;

  if (!DEFAULT_RENDER_SETTINGS) {
    failStartup(new Error("render-settings.js must be loaded before common.js"));
  }

  const DEFAULT_TRACK_COLORS = global.DEFAULT_TRACK_COLORS;

  if (!DEFAULT_TRACK_COLORS) {
    failStartup(new Error("track-colors.js must be loaded before common.js"));
  }

  const SCREEN_RATIOS = global.SCREEN_RATIOS;

  if (!SCREEN_RATIOS) {
    failStartup(new Error("ratios.js must be loaded before common.js"));
  }

  const PREVIEW_MESSAGES = global.PREVIEW_MESSAGES;

  if (!PREVIEW_MESSAGES) {
    failStartup(new Error("preview-protocol.js must be loaded before common.js"));
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
      const screen = SCREEN_RATIOS[name];
      const distance = Math.abs(screen.width / screen.height - aspect);
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
      width: logical.width,
      height: logical.height,
      scale: width ? width / logical.width : 1,
    };
  }

  function sizeScreenToLogicalUnits(screenElement, screen) {
    const shortSide = Math.min(screen.width, screen.height);
    document.documentElement.style.fontSize = shortSide / ROOT_FONT_DIVISOR + "px";

    screenElement.style.setProperty("--screen-width", screen.width + "px");
    screenElement.style.setProperty("--screen-height", screen.height + "px");
    screenElement.style.width = screen.width + "px";
    screenElement.style.height = screen.height + "px";
    screenElement.style.transformOrigin = "0 0";
    screenElement.setAttribute("data-ratio", screen.ratio);
  }

  function scaleScreenToOutputResolution(screenElement, screen) {
    [document.documentElement, document.body].forEach((element) => {
      element.style.width = screen.width * screen.scale + "px";
      element.style.height = screen.height * screen.scale + "px";
      element.style.margin = "0";
      element.style.overflow = "hidden";
    });
    screenElement.style.transform = "scale(" + screen.scale + ")";
  }

  function createScreen(context) {
    const screenElement = document.getElementById("screen");
    const screen = context.screen;

    if (!screenElement) return screen;

    sizeScreenToLogicalUnits(screenElement, screen);
    if (context.isEngineDriven) scaleScreenToOutputResolution(screenElement, screen);

    return screen;
  }

  function hash(seed) {
    const noise = Math.sin(seed * 12.9898) * 43758.5453;
    return noise - Math.floor(noise);
  }

  function loopedNoise(position, period) {
    const cell = Math.floor(position);
    const fraction = position - cell;
    const smoothed = fraction * fraction * (3 - 2 * fraction);
    const currentCell = ((cell % period) + period) % period;
    const nextCell = (currentCell + 1) % period;
    return hash(currentCell) * (1 - smoothed) + hash(nextCell) * smoothed;
  }

  function bandNoise(band, position, period) {
    return loopedNoise(position + band * 17.37, period);
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
      const time = frame / fps;
      const row = [];

      const kickPhase = (time % beatSeconds) / beatSeconds;
      const hatPhase = ((time + beatSeconds / 2) % beatSeconds) / beatSeconds;
      const kick = Math.exp(-kickPhase * 9);
      const hat = Math.exp(-hatPhase * 14);
      const swell = 0.6 + 0.4 * (Math.sin(2 * Math.PI * swellHz * time) * 0.5 + 0.5);

      for (let band = 0; band < bandCount; band++) {
        const shape = mockBandShape(band);
        const kickPull = kick * Math.exp(-band / (bandCount * 0.3 + 1));
        const hatPull = hat * (1 - Math.exp(-band / (bandCount * 0.4 + 1))) * 0.6;
        const wobble = (bandNoise(band, time * wobbleCellsPerSecond, wobblePeriod) - 0.5) * 0.35 * shape;
        const flicker = (bandNoise(band, time * flickerCellsPerSecond + 500, flickerPeriod) - 0.5) * 0.12;

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

    function frameIndexAt(time) {
      return clamp(Math.round(time * fps), 0, frames.length - 1);
    }

    function frameAt(time) {
      return frames.length ? frames[frameIndexAt(time)] : null;
    }

    function smoothedFrameAt(time, seconds) {
      if (!frames.length || bandCount === 0) return null;

      const center = frameIndexAt(time);
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

  function synthesizeHostedProperties(template) {
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

  function screenFor(properties) {
    return pickScreen(properties.width, properties.height);
  }

  function createContext(mock) {
    const template = mock || {};
    const isEngineDriven = !!global.__renderer;

    if (!isEngineDriven) {
      global.__renderer = { props: synthesizeHostedProperties(template) };
    }

    const properties = global.__renderer.props || {};

    return Object.assign(
      {
        isEngineDriven: isEngineDriven,
        screen: screenFor(properties),
        properties: properties,
        colors: mergeColorRoles(template.colors, properties.colors),
      },
      readSpectrum(properties.spectrum || {})
    );
  }

  function requestPropertiesFromHost() {
    if (!isFramed()) return Promise.resolve(null);

    return new Promise((resolve) => {
      function onMessage(event) {
        if (!event.data || event.data.type !== PREVIEW_MESSAGES.properties) return;
        global.removeEventListener("message", onMessage);
        resolve(event.data.properties || {});
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
    const hosted = await requestPropertiesFromHost();
    if (!hosted) return createContext(mock);

    const context = createContext(withHostedTrack(mock || {}, hosted));

    if (hosted.width && hosted.height) {
      context.properties.width = hosted.width;
      context.properties.height = hosted.height;
      context.screen = pickScreen(hosted.width, hosted.height);
    }

    return context;
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
      return { red: pixel[0], green: pixel[1], blue: pixel[2] };
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

  function fitToWindow(screen) {
    const screenElement = document.getElementById("screen");
    if (!screenElement) return;

    centerBodyInViewport();

    screenElement.style.flex = "0 0 auto";
    screenElement.style.transformOrigin = "center center";

    function scaleToFit() {
      const scale = Math.min(window.innerWidth / screen.width, window.innerHeight / screen.height);
      screenElement.style.transform = "scale(" + scale + ")";
    }

    scaleToFit();
    window.addEventListener("resize", scaleToFit);
  }

  function publishRendererContract(duration, seek) {
    global.__renderer = global.__renderer || {};
    Object.assign(global.__renderer, { duration: duration, seek: seek });
  }

  function signalFrameReady(time) {
    if (isEngineDrivenPage && typeof global.__renderer.ready === "function") {
      global.__renderer.ready(time);
    }
  }

  function redrawOnHostColorChange(context, redraw) {
    global.addEventListener("message", (event) => {
      if (!event.data || event.data.type !== PREVIEW_MESSAGES.colors) return;

      const screenElement = document.getElementById("screen");
      Object.assign(context.colors, event.data.colors || {});
      if (screenElement) applyColors(screenElement, context.colors);
      redraw(0);
    });
  }

  function playSelfDrivenLoop(context, seek) {
    const startedAt = performance.now();

    (function loop(now) {
      seek(((now - startedAt) / 1000) % context.duration);
      requestAnimationFrame(loop);
    })(startedAt);
  }

  function start(context, draw) {
    const elapsed = document.getElementById("elapsed");

    createScreen(context);

    function seek(time) {
      if (elapsed) {
        const progress = context.duration > 0 ? Math.min(1, time / context.duration) : 0;
        elapsed.style.width = (progress * 100).toFixed(2) + "%";
      }
      draw(time, context);
      signalFrameReady(time);
    }

    seek(0);
    publishRendererContract(context.duration, seek);

    if (isFramed()) redrawOnHostColorChange(context, seek);

    if (!context.isEngineDriven) {
      fitToWindow(context.screen);
      playSelfDrivenLoop(context, seek);
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
    startTemplate: startTemplate,
  };
})(window);
