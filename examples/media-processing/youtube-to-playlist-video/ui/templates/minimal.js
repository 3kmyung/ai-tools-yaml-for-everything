(async function () {
  const BAR_COUNT = window.STYLE_BAND_COUNTS.minimal;

  const BAR_WIDTH_EM = 0.1;
  const BAR_GAP_EM = 0.05;
  const BAR_MIN_HEIGHT_EM = 0.1;
  const SMOOTHING_WINDOW_SECONDS = 0.3;
  const SUPERSAMPLE = 2;

  const context = await Renderer.createHostedContext({
    bandCount: BAR_COUNT,
    colors: Object.fromEntries(
      window.STYLE_COLOR_ROLES.minimal.map((role) => [role, window.DEFAULT_TRACK_COLORS[role]])
    ),
  });

  const coverElement = document.getElementById("cover");
  const artistElement = document.getElementById("artist");
  const canvas = document.getElementById("eq");
  const canvasContext = canvas.getContext("2d");

  Renderer.createScreen(context);
  Renderer.applyColors(document.getElementById("screen"), context.colors);

  document.getElementById("title").textContent = context.properties.title || "Untitled";
  artistElement.textContent = context.properties.artist || "Unknown Artist";

  if (context.properties.cover) coverElement.src = context.properties.cover;
  else coverElement.classList.add("empty");

  if (document.fonts) await document.fonts.ready;

  const canvasStyle = getComputedStyle(canvas);
  const anchor = parseFloat(canvasStyle.fontSize);

  const barFill = canvasStyle.getPropertyValue("--muted").trim();
  const barWidth = BAR_WIDTH_EM * anchor;
  const slot = barWidth + BAR_GAP_EM * anchor;
  const barMinHeight = BAR_MIN_HEIGHT_EM * anchor;

  const artistStyle = getComputedStyle(artistElement);
  canvasContext.font =
    artistStyle.fontWeight + " " + artistStyle.fontSize + " " + artistStyle.fontFamily;
  const capHeight = canvasContext.measureText("H").actualBoundingBoxAscent;

  canvas.width = Math.round(context.bandCount * barWidth + (context.bandCount - 1) * BAR_GAP_EM * anchor);
  canvas.height = Math.round(capHeight);
  const canvasView = Renderer.superSample(canvas, SUPERSAMPLE * context.screen.scale);

  Renderer.start(context, (time) => {
    canvasView.apply(canvasContext);
    canvasContext.clearRect(0, 0, canvasView.width, canvasView.height);

    const frame = context.smoothedFrameAt(time, SMOOTHING_WINDOW_SECONDS);
    if (!frame) return;

    canvasContext.fillStyle = barFill;
    for (let band = 0; band < context.bandCount; band++) {
      const value = Math.min(1, frame[band] || 0);
      const barHeight = Math.max(barMinHeight, value * canvasView.height);
      canvasContext.fillRect(
        (context.bandCount - 1 - band) * slot,
        canvasView.height - barHeight,
        barWidth,
        barHeight
      );
    }
  });
})();
