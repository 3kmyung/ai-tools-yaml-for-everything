(async function () {
  const BAND_COUNT = window.STYLE_BAND_COUNTS.monochrome;

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

  Renderer.createScreen(context);
  Renderer.applyColors(screenElement, context.colors);

  document.getElementById("title").textContent = context.properties.title || "Untitled";
  document.getElementById("artist").textContent = context.properties.artist || "Unknown Artist";

  if (context.properties.cover) coverElement.src = context.properties.cover;
  else coverElement.classList.add("empty");

  if (document.fonts) await document.fonts.ready;

  let lastPrimary = null;

  Renderer.start(context, () => {
    if (context.colors.primary === lastPrimary) return;

    lastPrimary = context.colors.primary;
    screenElement.style.setProperty("--primary-vivid", maximizeVividness(lastPrimary));
  });
})();
