(async function () {
  const BAND_COUNT = window.STYLE_BAND_COUNTS.monochrome;

  const BAR_WIDTH_EM = 0.18;
  const BAR_GAP_EM = 0.16;
  const BAR_MIN_HEIGHT_EM = 0.16;
  const SMOOTHING_WINDOW_SECONDS = 0.3;
  const SUPERSAMPLE = 2;

  function smoothstep(value) {
    return value * value * (3 - 2 * value);
  }

  function maximizeVividness(color) {
    const digits = /^#([0-9a-f]{6})$/i.exec(String(color).trim());

    if (!digits) return color;

    const packed = parseInt(digits[1], 16);
    const red = (packed >> 16) & 0xff;
    const green = (packed >> 8) & 0xff;
    const blue = packed & 0xff;

    const highest = Math.max(red, green, blue);
    const lowest = Math.min(red, green, blue);

    if (highest === lowest) return color;

    const channel = (component) =>
      Math.round((255 * (component - lowest)) / (highest - lowest));

    const vivid = (channel(red) << 16) | (channel(green) << 8) | channel(blue);

    return "#" + vivid.toString(16).padStart(6, "0");
  }

  const context = await Renderer.createHostedContext({
    bandCount: BAND_COUNT,
    colors: Object.fromEntries(
      window.STYLE_COLOR_ROLES.monochrome.map((role) => [role, window.DEFAULT_TRACK_COLORS[role]])
    ),
  });

  const screenElement = document.getElementById("screen");
  const coverElement = document.getElementById("cover");
  const titleElement = document.getElementById("title");
  const canvas = document.getElementById("eq");
  const canvasContext = canvas.getContext("2d");

  Renderer.createScreen(context);
  Renderer.applyColors(screenElement, context.colors);

  titleElement.textContent = context.properties.title || "Untitled";
  document.getElementById("artist").textContent = context.properties.artist || "Unknown Artist";

  if (context.properties.cover) coverElement.src = context.properties.cover;
  else coverElement.classList.add("empty");

  if (document.fonts) await document.fonts.ready;

  const canvasStyle = getComputedStyle(canvas);
  const anchor = parseFloat(canvasStyle.fontSize);

  const barWidth = BAR_WIDTH_EM * anchor;
  const slot = barWidth + BAR_GAP_EM * anchor;
  const barMinHeight = BAR_MIN_HEIGHT_EM * anchor;

  const captionLineHeight = parseFloat(getComputedStyle(titleElement).lineHeight);

  canvas.width = Math.round(context.bandCount * barWidth + (context.bandCount - 1) * BAR_GAP_EM * anchor);
  canvas.height = Math.round(captionLineHeight);

  const canvasView = Renderer.superSample(canvas, SUPERSAMPLE * context.screen.scale);

  const barFill = getComputedStyle(screenElement).color;

  let lastPrimary = null;

  Renderer.start(context, (time) => {
    if (context.colors.primary !== lastPrimary) {
      lastPrimary = context.colors.primary;
      screenElement.style.setProperty("--primary-vivid", maximizeVividness(lastPrimary));
    }

    canvasView.apply(canvasContext);
    canvasContext.clearRect(0, 0, canvasView.width, canvasView.height);

    const frame = context.smoothedFrameAt(time, SMOOTHING_WINDOW_SECONDS);
    if (!frame) return;

    canvasContext.fillStyle = barFill;

    for (let band = 0; band < context.bandCount; band++) {
      const value = Math.min(1, frame[band] || 0);
      const barHeight = Math.max(barMinHeight, smoothstep(value) * canvasView.height);

      canvasContext.fillRect((context.bandCount - 1 - band) * slot, 0, barWidth, barHeight);
    }
  });
})();
