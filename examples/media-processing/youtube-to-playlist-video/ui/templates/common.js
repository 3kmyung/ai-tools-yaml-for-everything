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

  const STAGE_RATIOS = global.STAGE_RATIOS;

  if (!STAGE_RATIOS) {
    throw new Error("ratios.js must be loaded before common.js");
  }

  const PREVIEW_MESSAGES = global.PREVIEW_MESSAGES;

  if (!PREVIEW_MESSAGES) {
    throw new Error("preview-protocol.js must be loaded before common.js");
  }

  const FALLBACK_RATIO = DEFAULT_RENDER_SETTINGS.ratio;
  const FALLBACK_FPS = DEFAULT_RENDER_SETTINGS.fps;
  const FALLBACK_DURATION_SECONDS = 5.0;

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

    Object.keys(STAGE_RATIOS).forEach((name) => {
      const spec = STAGE_RATIOS[name];
      const distance = Math.abs(spec.width / spec.height - aspect);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestName = name;
      }
    });

    return nearestName;
  }

  function pickStage(outputWidth, outputHeight) {
    const width = positiveSize(outputWidth);
    const height = positiveSize(outputHeight);
    const name = width && height ? nearestRatioName(width / height) : FALLBACK_RATIO;
    const logical = STAGE_RATIOS[name];

    return {
      ratio: name,
      orient: logical.orient,
      width: logical.width,
      height: logical.height,
      scale: width ? width / logical.width : 1,
    };
  }

  function sizeStageToLogicalUnits(stage, spec) {
    stage.style.setProperty("--stage-w", spec.width + "px");
    stage.style.setProperty("--stage-h", spec.height + "px");
    stage.style.width = spec.width + "px";
    stage.style.height = spec.height + "px";
    stage.style.transformOrigin = "0 0";
    stage.setAttribute("data-ratio", spec.ratio);
    stage.setAttribute("data-orient", spec.orient);
  }

  function scaleStageToOutputResolution(stage, spec) {
    [document.documentElement, document.body].forEach((element) => {
      element.style.width = spec.width * spec.scale + "px";
      element.style.height = spec.height * spec.scale + "px";
      element.style.margin = "0";
      element.style.overflow = "hidden";
    });
    stage.style.transform = "scale(" + spec.scale + ")";
  }

  function createStage(ctx) {
    const stage = document.getElementById("stage");
    const spec = ctx.stage;

    if (!stage) return spec;

    sizeStageToLogicalUnits(stage, spec);
    if (ctx.isEngineDriven) scaleStageToOutputResolution(stage, spec);

    return spec;
  }

  function authoredFontSize(element) {
    return parseFloat(getComputedStyle(element).fontSize);
  }

  function overflowsItsWidth(element) {
    return element.scrollWidth > element.clientWidth;
  }

  function shrinkFontUntil(element, authoredSize, minSize, fits) {
    let size = authoredSize;

    while (size > minSize && !fits()) {
      size -= 1;
      element.style.fontSize = size + "px";
    }

    return size;
  }

  function fitTextWidth(element, options) {
    const minSize = options.minSize;
    const authoredSize = authoredFontSize(element);

    const fitsOnOneLine = () => !overflowsItsWidth(element);
    if (fitsOnOneLine()) return authoredSize;

    return shrinkFontUntil(element, authoredSize, minSize, fitsOnOneLine);
  }

  function buildMockSpectrum(bandCount, fps, duration) {
    const frames = [];

    for (let frame = 0; frame < duration * fps; frame++) {
      const t = frame / fps;
      const row = [];

      for (let band = 0; band < bandCount; band++) {
        const sweep = Math.sin(t * 2.4 + band * 0.5) * 0.5 + 0.5;
        const wobble = Math.sin(t * 7 + band) * 0.15;
        row.push(clamp(sweep * 0.8 + wobble + 0.1, 0, 1));
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

  function stageFor(props) {
    return pickStage(props.width, props.height);
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
        stage: stageFor(props),
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
      ctx.stage = pickStage(hosted.width, hosted.height);
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
    const stage = document.getElementById("stage");
    if (!stage) return;

    centerBodyInViewport();

    stage.style.flex = "0 0 auto";
    stage.style.transformOrigin = "center center";

    function scaleToFit() {
      const scale = Math.min(window.innerWidth / spec.width, window.innerHeight / spec.height);
      stage.style.transform = "scale(" + scale + ")";
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

      const stage = document.getElementById("stage");
      Object.assign(ctx.colors, event.data.colors || {});
      if (stage) applyColors(stage, ctx.colors);
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

    createStage(ctx);

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
      fitToWindow(ctx.stage);
      playSelfDrivenLoop(ctx, seek);
    }
  }

  global.Renderer = {
    STAGE_RATIOS: STAGE_RATIOS,
    pickStage: pickStage,
    createStage: createStage,
    createContext: createContext,
    createHostedContext: createHostedContext,
    applyColors: applyColors,
    fitTextWidth: fitTextWidth,
    loadImage: loadImage,
    averageColor: averageColor,
    superSample: superSample,
    start: start,
  };
})(window);
