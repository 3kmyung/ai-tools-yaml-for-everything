/*
 * Shared runtime for every animation-*.html template in this folder.
 *
 * The workflow deliberately hands these templates RAW inputs (the cover
 * image, the colors, the spectrum) and does no visual processing of its
 * own. Every pixel-level effect — the waveform, the layout — is
 * implemented here or in a template, so the code that runs during a real
 * `model-compose` render is the exact same code that runs when you open
 * the .html file directly in a browser. Change it in one place, see it
 * live in the preview, get it in the video.
 *
 * The html-frame-renderer contract: a page must expose
 * `window.__renderer.duration` (seconds) and `window.__renderer.seek(t)`.
 * The engine reads duration once to count frames, then calls seek(t)
 * before every screenshot. seek() must be synchronous and deterministic —
 * frame N must look identical no matter what was rendered before it.
 */
(function (global) {
  "use strict";

  var DEFAULT_COLORS = {
    primary: "#111111",
    secondary: "#1b1f3b",
    accent: "#ff5b04",
    text: "#f5f5f0",
  };

  /*
   * The five output shapes, with the short side pinned at 720.
   *
   * Pinning the short side rather than the area or the width is what keeps
   * one type scale usable across all of them: the short side is what governs
   * how large anything reads, so a 48px title looks like a 48px title in
   * every ratio. 16:9 is deliberately the size the templates were authored
   * at, so the landscape layout needed no re-tuning when the others arrived.
   */
  var RATIOS = {
    "16:9": { width: 1280, height: 720,  orient: "landscape" },
    "4:3":  { width: 960,  height: 720,  orient: "landscape" },
    "1:1":  { width: 720,  height: 720,  orient: "square"    },
    "3:4":  { width: 720,  height: 960,  orient: "portrait"  },
    "9:16": { width: 720,  height: 1280, orient: "portrait"  },
  };

  var DEFAULT_RATIO = "16:9";

  /*
   * Chooses the logical stage for a requested output size.
   *
   * Nearest-ratio rather than exact-match: the workflow accepts arbitrary
   * width/height, and a size a few pixels off a preset should still lay out
   * as the ratio it obviously is rather than falling back to 16:9. `scale` is
   * taken from the width alone — for an off-preset size the height may not
   * divide evenly, and letting the width govern keeps the frame full-bleed
   * horizontally, which is the edge a viewer notices.
   */
  function pickStage(outputWidth, outputHeight) {
    var width = Number(outputWidth) > 0 ? Number(outputWidth) : null;
    var height = Number(outputHeight) > 0 ? Number(outputHeight) : null;

    var name = DEFAULT_RATIO;

    if (width && height) {
      var target = width / height;
      var bestDistance = Infinity;

      Object.keys(RATIOS).forEach(function (candidate) {
        var spec = RATIOS[candidate];
        var distance = Math.abs(spec.width / spec.height - target);
        if (distance < bestDistance) {
          bestDistance = distance;
          name = candidate;
        }
      });
    }

    var logical = RATIOS[name];

    return {
      ratio: name,
      orient: logical.orient,
      width: logical.width,
      height: logical.height,
      scale: width ? width / logical.width : 1,
    };
  }

  /*
   * Sizes #stage in logical units and scales it to the real output.
   *
   * Chromium rasterises after the transform, so text and borders come out at
   * the output resolution rather than being upscaled — which is the whole
   * reason templates can keep authoring in absolute px. Canvases are the one
   * exception: their backing store is fixed when it is allocated, which is
   * what superSample()'s factor is for. Pass ctx.stage.scale into it.
   */
  function createStage(ctx) {
    var stage = document.getElementById("stage");
    var spec = ctx.stage;

    if (!stage) return spec;

    stage.style.setProperty("--stage-w", spec.width + "px");
    stage.style.setProperty("--stage-h", spec.height + "px");
    stage.style.width = spec.width + "px";
    stage.style.height = spec.height + "px";
    stage.style.transformOrigin = "0 0";
    stage.setAttribute("data-ratio", spec.ratio);
    stage.setAttribute("data-orient", spec.orient);

    /*
     * Only a real render scales here. A preview — from disk or in the GUI's
     * iframe — is fitted to its container instead, by fitToWindow(), because
     * scaling twice (once to the output resolution, once again to fit the
     * viewer) would compound.
     */
    if (!ctx.isPreview) {
      [document.documentElement, document.body].forEach(function (element) {
        element.style.width = spec.width * spec.scale + "px";
        element.style.height = spec.height * spec.scale + "px";
        element.style.margin = "0";
        element.style.overflow = "hidden";
      });
      stage.style.transform = "scale(" + spec.scale + ")";
    }

    return spec;
  }

  /*
   * Shrinks an element's type until its text fits, then clamps.
   *
   * The templates were authored against an eight-character fixture, but the
   * title's default is the video's own title and those run long. Rather than
   * make every template guess a font size that suits both, each declares how
   * many lines it can spare and this finds a size that fits.
   *
   * Called once during setup, before start(), so it never runs inside seek()
   * and frame N stays reproducible.
   *
   * A title that already fits comes out of here untouched — not merely at
   * the same font-size, but with the element's own styles unwritten, so the
   * frame is identical to one rendered before fitText existed. That is the
   * whole reason the fit test below is a line count and not a height
   * comparison; see countLines.
   */
  function fitText(element, options) {
    options = options || {};

    var maxLines = options.maxLines || 3;
    var minSize = options.minSize || 16;
    var size = parseFloat(getComputedStyle(element).fontSize);

    /* Measured in the element's authored layout, which is the layout it
       keeps if it fits. Nothing is written until something has to be. */
    if (countLines(element) <= maxLines) {
      return size;
    }

    /* Only now does the element become the box that can clamp.
       -webkit-line-clamp is deliberately withheld until the size settles: a
       clamped element lays out only its visible lines, so measuring through
       one would report "fits" for text that plainly does not. */
    element.style.display = "-webkit-box";
    element.style.webkitBoxOrient = "vertical";
    element.style.overflow = "hidden";

    /* Step down rather than binary-search: the range is small, and a
       monotonic walk cannot land on a size the browser measures differently
       depending on how it was reached. Re-measured inside the -webkit-box,
       since an inline element (waveform's <span id="title">) wraps at a
       different width once it is block-level. */
    while (size > minSize && countLines(element) > maxLines) {
      size -= 1;
      element.style.fontSize = size + "px";
    }

    element.style.webkitLineClamp = String(maxLines);

    return size;
  }

  /*
   * How many line boxes the element's text occupies.
   *
   * Not scrollHeight vs clientHeight: scrollHeight measures the ink the
   * glyphs paint, and at a tight line-height (below the browser's default
   * of roughly 1.2) a font's own ascent+descent is taller than the line
   * box, so scrollHeight exceeds clientHeight for a single line that never
   * wraps. Read as overflow, that shrinks titles which already fitted. A
   * Range over the contents yields one client rect per rendered line, which
   * is the question actually being asked, and is indifferent to
   * line-height.
   *
   * Counted by distinct rect top, not rect count: one line can yield
   * several rects when the text is split across inline fragments (an
   * ellipsised inline span produces exactly that), and every fragment of a
   * given line shares that line's top.
   */
  function countLines(element) {
    var range = document.createRange();
    range.selectNodeContents(element);

    var rects = range.getClientRects();
    var tops = [];

    for (var i = 0; i < rects.length; i++) {
      if (tops.indexOf(rects[i].top) === -1) {
        tops.push(rects[i].top);
      }
    }

    return tops.length;
  }

  /*
   * The stand-in track every template previews with. Deliberately one
   * definition rather than per-template mocks: opening every template side
   * by side should compare the templates, not different fixtures.
   *
   * A real render never reaches this — the workflow injects __renderer.props
   * before the page script runs, and the whole isDevPreview branch is
   * skipped.
   *
   * The artwork is 1400x1400, which is the master's own ceiling — asking the
   * URL for more just returns this. Two things make it the right fixture
   * rather than the Wikipedia file it replaced: that one is capped at 316px
   * by non-free-content policy, so a preview could never show whether a
   * template resamples the cover well, and this host sends
   * Access-Control-Allow-Origin, so loading it crossOrigin="anonymous"
   * leaves the canvas readable and averageColor() keeps working. A local
   * file would not — under file:// each sibling is its own origin, and the
   * first getImageData would taint out.
   */
  var COVER_ART =
    "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/b3/ac/c3" +
    "/b3acc372-089f-e254-ce76-298ec6f2a2f0/8809928953823_Cover.jpg/1400x1400bb.jpg";

  var PREVIEW_TRACK = {
    title: "Papillon",
    artist: "NMIXX",
    // The playlist neighbours. Both are set here so the preview exercises the
    // case a template has to lay out; the ends of a real playlist send "",
    // which is the branch a template must also handle.
    prev_title: "Dash",
    next_title: "Know I Know",
    cover: COVER_ART,
    colors: { primary: "#ffffff", secondary: "#c3d4f2", accent: "#1d4ed8", text: "#111111" },
  };

  /* A fake spectrum so the dev preview has something to animate. */
  function buildMockSpectrum(bandCount, fps, duration) {
    var frames = [];
    for (var f = 0; f < duration * fps; f++) {
      var t = f / fps;
      var row = [];
      for (var i = 0; i < bandCount; i++) {
        var wave = Math.sin(t * 2.4 + i * 0.5) * 0.5 + 0.5;
        var wobble = Math.sin(t * 7 + i) * 0.15;
        row.push(Math.max(0.05, Math.min(1, wave * 0.8 + wobble + 0.1)));
      }
      frames.push(row);
    }
    return { frames: frames, fps: fps, band_count: bandCount, duration: duration };
  }

  /*
   * The preview host injects props over postMessage instead of the renderer's
   * init script, because an iframe's document starts loading before the
   * parent can touch it — by the time `load` fires the page script has
   * already read __renderer. So a framed page announces itself and waits.
   *
   * Unframed, this resolves immediately and everything downstream is exactly
   * the from-disk path it always was.
   */
  function awaitHostProps() {
    if (global.parent === global) return Promise.resolve(null);

    return new Promise(function (resolve) {
      function onMessage(event) {
        if (event.data && event.data.type === "preview-props") {
          global.removeEventListener("message", onMessage);
          resolve(event.data.props || {});
        }
      }
      global.addEventListener("message", onMessage);
      global.parent.postMessage({ type: "preview-ready" }, "*");
    });
  }

  /*
   * The async form of createContext: identical, except it first gives a
   * parent frame the chance to supply props.
   *
   * The hosted props protocol only carries the fields a human actually
   * edits — title, artist, cover, colors — not spectrum, fps, or a
   * template's own bandCount/duration. Pre-setting global.__renderer with
   * just those fields (as an earlier version of this function did) makes
   * createContext()'s `isDevPreview` false, which skips its entire
   * mock-synthesis branch — the branch that calls buildMockSpectrum(). The
   * result is a hosted preview with band_count: 0 (a dead equalizer) and
   * duration pinned at the hardcoded 5.0 fallback, regardless of what this
   * template asked for.
   *
   * So instead: leave global.__renderer untouched and let createContext()
   * take its normal from-disk branch, but layer the hosted fields into
   * `mock` first. That keeps every from-disk behavior this branch already
   * has — including `mock.cover || PREVIEW_TRACK.cover`-style fallbacks and
   * the template's own bandCount/fps/duration, which are not present in
   * `hosted` and so pass through untouched.
   */
  async function createHostedContext(mock) {
    var hosted = await awaitHostProps();

    var effectiveMock = hosted
      ? Object.assign({}, mock, {
          title: hosted.title,
          artist: hosted.artist,
          cover: hosted.cover,
          colors: hosted.colors,
        })
      : mock;

    var ctx = createContext(effectiveMock);

    if (hosted) {
      /*
       * Hosted pages have real props, so isDevPreview is false — but a human
       * is watching, not the screenshot engine. isPreview is what gates the
       * animation loop and the fit-to-container transform, so it has to be
       * true here or the iframe would show a frozen frame 0 scaled to the
       * output resolution.
       */
      ctx.isPreview = true;

      /*
       * width/height are the one thing the mock-synthesis branch never
       * folds into its props (createContext derives the stage from the
       * ?ratio= query param when they're absent) — the host's preview.js
       * always sends the logical stage size here, never the output
       * resolution, so re-deriving the stage from it is safe.
       */
      if (hosted.width && hosted.height) {
        ctx.props.width = hosted.width;
        ctx.props.height = hosted.height;
        ctx.stage = pickStage(hosted.width, hosted.height);
      }
    }

    return ctx;
  }

  /*
   * Reads the props the workflow injected, or synthesizes mock ones from
   * PREVIEW_TRACK when this page was opened straight from disk.
   *
   * `mock` is for the knobs a template legitimately owns — band count, fps,
   * preview duration. It can still override the track fields, but a style
   * that does so stops being comparable with the others, so don't unless the
   * style is specifically about that field.
   */
  function createContext(mock) {
    mock = mock || {};

    var isDevPreview = !global.__renderer;

    // Lets tools/screenshot-ratios.py (and anyone eyeballing a template from
    // disk) swap in a realistic title without editing PREVIEW_TRACK — the
    // fixture's own "Papillon" is eight characters and never exercises what
    // a real YouTube title does to a layout. mock.title still wins when a
    // template sets one itself; none currently do.
    var previewTitle = new URLSearchParams(global.location.search).get("title");

    if (isDevPreview) {
      global.__renderer = {
        props: {
          title: mock.title || previewTitle || PREVIEW_TRACK.title,
          artist: mock.artist || PREVIEW_TRACK.artist,
          // ?? rather than ||, so a template previewing the end of a
          // playlist can pass "" and actually get "".
          prev_title: mock.prev_title != null ? mock.prev_title : PREVIEW_TRACK.prev_title,
          next_title: mock.next_title != null ? mock.next_title : PREVIEW_TRACK.next_title,
          cover: mock.cover || PREVIEW_TRACK.cover,
          colors: Object.assign({}, DEFAULT_COLORS, PREVIEW_TRACK.colors, mock.colors || {}),
          spectrum: buildMockSpectrum(mock.bandCount || 22, mock.fps || 30, mock.duration || 5),
        },
      };
    }

    var props = (global.__renderer && global.__renderer.props) || {};

    var previewRatio = new URLSearchParams(global.location.search).get("ratio");
    var previewRatioSpec = RATIOS[previewRatio] || RATIOS[DEFAULT_RATIO];
    var stage = props.width && props.height
      ? pickStage(props.width, props.height)
      : pickStage(previewRatioSpec.width, previewRatioSpec.height);

    var spectrum = props.spectrum || { frames: [], fps: 30, band_count: 0, duration: 5.0 };
    var frames = spectrum.frames || [];
    var fps = spectrum.fps || 30;
    var bandCount = spectrum.band_count || (frames[0] ? frames[0].length : 0);

    function frameAt(t) {
      if (!frames.length) return null;
      var index = Math.min(frames.length - 1, Math.max(0, Math.round(t * fps)));
      return frames[index];
    }

    /* Mean of the lowest few bands — the "is the bass hitting" signal. */
    function bassAt(t) {
      var frame = frameAt(t);
      if (!frame || bandCount === 0) return 0;
      var span = Math.max(1, Math.min(5, bandCount));
      var sum = 0;
      for (var i = 0; i < span; i++) sum += frame[i] || 0;
      return Math.max(0, Math.min(1, sum / span));
    }

    return {
      isDevPreview: isDevPreview,
      isPreview: isDevPreview,
      stage: stage,
      props: props,
      colors: Object.assign({}, DEFAULT_COLORS, props.colors || {}),
      duration: spectrum.duration || 5.0,
      fps: fps,
      bandCount: bandCount,
      frames: frames,
      frameAt: frameAt,
      bassAt: bassAt,
    };
  }

  /* Publishes colors as CSS custom properties on an element. */
  function applyColors(element, colors) {
    element.style.setProperty("--primary", colors.primary);
    element.style.setProperty("--secondary", colors.secondary);
    element.style.setProperty("--accent", colors.accent);
    element.style.setProperty("--text", colors.text);
  }

  /*
   * `crossOrigin` is opt-in because it is a trade: passing "anonymous" lets
   * a template read the pixels back afterwards, but turns a host that sends
   * no CORS headers into an outright load failure instead of a merely
   * unreadable image. Only ask for it when you intend to sample the result.
   */
  function loadImage(url, crossOrigin) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      if (crossOrigin) image.crossOrigin = crossOrigin;
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("failed to load image: " + url)); };
      image.src = url;
    });
  }

  /*
   * Mean color of an image, taken by downsampling to a single pixel so the
   * browser does the averaging.
   *
   * Returns null instead of throwing when the source tainted the canvas:
   * reading a canvas back (toDataURL / getImageData) throws once a
   * cross-origin image has been drawn onto it, and under file:// every
   * sibling file counts as a separate origin — so a preview cover loaded
   * without crossOrigin="anonymous" would taint the probe while the real
   * render (where covers arrive as same-origin data: URIs) kept working. A
   * template asking "what color is this?" should be able to fall back to a
   * default; it should not take the whole render down because a cover
   * arrived without CORS headers.
   */
  function averageColor(image) {
    var probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;

    var context = probe.getContext("2d");
    context.drawImage(image, 0, 0, 1, 1);

    try {
      var pixel = context.getImageData(0, 0, 1, 1).data;
      return { r: pixel[0], g: pixel[1], b: pixel[2] };
    } catch (error) {
      return null;
    }
  }

  /*
   * Gives a canvas more device pixels than it occupies on the page, so that
   * antialiasing is computed on a grid finer than the frame the renderer
   * screenshots. Mostly visible on near-horizontal strokes and any edge that
   * doesn't land on a whole pixel.
   *
   * The element keeps its authored size as its *layout* size, and the
   * drawing code keeps working in those same units — apply() installs the
   * scale on the context, so no coordinate anywhere has to change.
   *
   * Call this once, before the first draw, and call the returned apply() at
   * the top of every frame. It uses setTransform rather than scale() on
   * purpose: seek() may be invoked any number of times in any order, and
   * scale() would compound the factor on every one of them.
   */
  function superSample(canvas, factor) {
    var width = canvas.width;
    var height = canvas.height;

    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * factor);
    canvas.height = Math.round(height * factor);

    return {
      width: width,
      height: height,
      apply: function (context) {
        context.setTransform(factor, 0, 0, factor, 0, 0);
      },
    };
  }

  /*
   * Dev preview only. The stage is authored at its logical size, which is
   * either larger or a different shape than the browser window, so scale the
   * whole thing to fit. Purely a viewing transform — nothing inside #stage
   * moves, so what you are eyeballing is still the real layout.
   */
  function fitToWindow(spec) {
    var stage = document.getElementById("stage");
    if (!stage) return;

    [document.documentElement, document.body].forEach(function (element) {
      element.style.width = "100%";
      element.style.height = "100%";
      element.style.overflow = "hidden";
    });

    document.body.style.display = "flex";
    document.body.style.alignItems = "center";
    document.body.style.justifyContent = "center";
    document.body.style.background = "#000";

    stage.style.flex = "0 0 auto";
    stage.style.transformOrigin = "center center";

    function apply() {
      var scale = Math.min(window.innerWidth / spec.width, window.innerHeight / spec.height);
      stage.style.transform = "scale(" + scale + ")";
    }

    apply();
    window.addEventListener("resize", apply);
  }

  /*
   * Wires up the html-frame-renderer contract. Call this only once every
   * asset the first frame needs is loaded — the engine screenshots as
   * soon as seek() exists, so exposing it early yields blank frames.
   *
   * `draw(t, ctx)` is called for each frame; #progress-fill, if the page
   * has one, is advanced automatically.
   */
  function start(ctx, draw) {
    var progressFill = document.getElementById("progress-fill");

    // Always applied — a real render needs #stage sized and scaled to the
    // output resolution just as much as a preview needs it sized to its
    // logical ratio. Only the *viewing* transform below (fitToWindow) is
    // preview-only.
    createStage(ctx);

    function seek(t) {
      if (progressFill) {
        var progress = ctx.duration > 0 ? Math.min(1, t / ctx.duration) : 0;
        progressFill.style.width = (progress * 100).toFixed(2) + "%";
      }
      draw(t, ctx);
    }

    seek(0);

    global.__renderer = global.__renderer || {};
    Object.assign(global.__renderer, { duration: ctx.duration, seek: seek });

    /*
     * Colors are the one thing the host can change without a reload: they are
     * CSS custom properties and a redraw, where a new cover or title would
     * need the whole init path again. Dragging a color picker is the
     * interaction that makes the difference visible.
     */
    if (global.parent !== global) {
      global.addEventListener("message", function (event) {
        if (!event.data || event.data.type !== "preview-colors") return;
        var stage = document.getElementById("stage");
        Object.assign(ctx.colors, event.data.colors || {});
        if (stage) applyColors(stage, ctx.colors);
        seek(0);
      });
    }

    if (ctx.isPreview) {
      fitToWindow(ctx.stage);

      var startTime = performance.now();
      (function loop(now) {
        seek(((now - startTime) / 1000) % ctx.duration);
        requestAnimationFrame(loop);
      })(startTime);
    }
  }

  global.Renderer = {
    RATIOS: RATIOS,
    pickStage: pickStage,
    createStage: createStage,
    createContext: createContext,
    createHostedContext: createHostedContext,
    applyColors: applyColors,
    fitText: fitText,
    loadImage: loadImage,
    averageColor: averageColor,
    superSample: superSample,
    start: start,
  };
})(window);
