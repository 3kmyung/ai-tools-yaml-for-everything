(async function () {
  const BAND_COUNT = window.STYLE_BAND_COUNTS.refined;

  const BAR_WIDTH_EM = 0.18;
  const BAR_GAP_EM = 0.16;
  const BAR_MIN_HEIGHT_EM = 0.16;
  const SMOOTHING_WINDOW_SECONDS = 0.3;
  const SUPERSAMPLE = 2;

  function smoothstep(value) {
    return value * value * (3 - 2 * value);
  }

  const context = await Renderer.createHostedContext({
    bandCount: BAND_COUNT,
    colors: Object.fromEntries(
      window.STYLE_COLOR_ROLES.refined.map((role) => [role, window.DEFAULT_TRACK_COLORS[role]])
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

  Renderer.start(context, (time) => {
    canvasView.apply(canvasContext);
    canvasContext.clearRect(0, 0, canvasView.width, canvasView.height);

    const frame = context.smoothedFrameAt(time, SMOOTHING_WINDOW_SECONDS);
    if (!frame) return;

    canvasContext.fillStyle = context.colors.accent;

    for (let band = 0; band < context.bandCount; band++) {
      const value = Math.min(1, frame[band] || 0);
      const barHeight = Math.max(barMinHeight, smoothstep(value) * canvasView.height);

      canvasContext.fillRect((context.bandCount - 1 - band) * slot, 0, barWidth, barHeight);
    }
  });
})();
