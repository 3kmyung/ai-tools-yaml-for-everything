(async function () {
  const BAND_COUNT = window.STYLE_BAND_COUNTS.refined;

  const WAVE_COUNT = 2;
  const CURVE_COUNT = Math.ceil(BAND_COUNT / WAVE_COUNT);

  const DEPTH_FLOOR = 0.35;
  const SWING_EM = 6.0;
  const LEVEL_TRIM = 0.05;
  const LEVEL_RANGE_FLOOR = 0.01;
  const SPREAD_TOTAL_EM = 3.2;
  const BASELINE_FRACTION = 0.5;
  const LINE_WIDTH_PX = 2.0;
  const ALPHA_FALLOFF = 3.5;

  const SMOOTHING_SECONDS = 1.4;
  const ATTENUATION_FACTOR = 4;
  const ATTENUATION_REACH = 1.6;
  const BASE_WAVELENGTH = 1.15;
  const WAVELENGTH_RATIO = 0.55;
  const WAVE_WEIGHT_RATIO = 0.6;
  const BASE_WAVE_SPEED = 0.55;
  const WAVE_PHASE_STEP = 2.4;
  const CURVE_PHASE_STEP = 1.7;
  const CURVE_SPEED_SPREAD = 0.16;
  const FADE_FRACTION = 0.18;
  const DIAGONAL_TILT = 0.35;
  const DIAGONAL_FLOOR = 0.25;

  const SAMPLE_COUNT = 240;
  const SPAN_FRACTION = 0.72;
  const SUPERSAMPLE = 2;

  function fadeOf(color) {
    const digits = /^#([0-9a-f]{6})$/i.exec(String(color).trim());
    if (!digits) return "transparent";

    const packed = parseInt(digits[1], 16);
    const channels = [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];

    return "rgba(" + channels.join(", ") + ", 0)";
  }

  function positionAt(sample) {
    return sample / (SAMPLE_COUNT - 1);
  }

  function normalize(levels) {
    const quiet = percentileOf(levels, LEVEL_TRIM);
    const range = Math.max(LEVEL_RANGE_FLOOR, percentileOf(levels, 1 - LEVEL_TRIM) - quiet);
    return levels.map((level) => (level - quiet) / range);
  }

  function percentileOf(values, fraction) {
    const sorted = Float64Array.from(values).sort();
    const last = sorted.length - 1;
    return sorted[Math.min(last, Math.max(0, Math.round(fraction * last)))];
  }

  function levelAt(levels, position) {
    const last = levels.length - 1;
    const index = Math.min(last, Math.max(0, Math.floor(position)));
    const fraction = Math.min(1, Math.max(0, position - index));

    function sample(offset) {
      return levels[Math.min(last, Math.max(0, index + offset))];
    }

    const previous = sample(-1);
    const start = sample(0);
    const end = sample(1);
    const next = sample(2);
    const squared = fraction * fraction;

    return (
      0.5 *
      (2 * start +
        (end - previous) * fraction +
        (2 * previous - 5 * start + 4 * end - next) * squared +
        (3 * start - 3 * end + next - previous) * squared * fraction)
    );
  }

  function attenuationAt(position) {
    const centered = Math.abs(position * 2 - 1) * ATTENUATION_REACH;

    return Math.pow(
      ATTENUATION_FACTOR / (ATTENUATION_FACTOR + Math.pow(centered, ATTENUATION_FACTOR)),
      ATTENUATION_FACTOR
    );
  }

  const context = await Renderer.createHostedContext({
    bandCount: BAND_COUNT,
    colors: Object.fromEntries(
      window.STYLE_COLOR_ROLES.refined.map((role) => [role, window.DEFAULT_TRACK_COLORS[role]])
    ),
  });

  const screenElement = document.getElementById("screen");
  const coverElement = document.getElementById("cover");
  const canvas = document.getElementById("eq");
  const canvasContext = canvas.getContext("2d");

  Renderer.createScreen(context);
  Renderer.applyColors(screenElement, context.colors);

  document.getElementById("title").textContent = context.properties.title || "Untitled";
  document.getElementById("artist").textContent = context.properties.artist || "Unknown Artist";

  if (context.properties.cover) coverElement.src = context.properties.cover;
  else coverElement.classList.add("empty");

  if (document.fonts) await document.fonts.ready;

  canvas.width = Math.round(canvas.offsetWidth);
  canvas.height = Math.round(canvas.offsetHeight);

  const canvasView = Renderer.superSample(canvas, SUPERSAMPLE * context.screen.scale);

  const baseline = canvasView.height * BASELINE_FRACTION;

  const span = canvasView.width * SPAN_FRACTION;
  const spanStart = (canvasView.width - span) / 2;

  const scanCount = Math.max(2, Math.round(context.duration * context.fps));
  const scanSeconds = context.duration / scanCount;
  const scanFrames = Array.from(
    { length: scanCount },
    (unused, scanIndex) => context.smoothedFrameAt(scanIndex * scanSeconds, SMOOTHING_SECONDS) || []
  );

  const edgeAttenuation = attenuationAt(0);
  const envelope = Float64Array.from({ length: SAMPLE_COUNT }, (unused, sample) =>
    Math.max(0, (attenuationAt(positionAt(sample)) - edgeAttenuation) / (1 - edgeAttenuation))
  );

  const wavelengths = Float64Array.from({ length: WAVE_COUNT }, (unused, index) =>
    BASE_WAVELENGTH * Math.pow(WAVELENGTH_RATIO, index)
  );

  const waveNumbers = Float64Array.from(wavelengths, (wavelength) => (2 * Math.PI) / wavelength);

  const waveRates = Float64Array.from(wavelengths, (wavelength, index) =>
    waveNumbers[index] * BASE_WAVE_SPEED * Math.sqrt(wavelength / BASE_WAVELENGTH)
  );

  const waveWeights = Float64Array.from({ length: WAVE_COUNT }, (unused, index) =>
    Math.pow(WAVE_WEIGHT_RATIO, index)
  );

  const weightTotal = waveWeights.reduce((total, weight) => total + weight, 0);

  const spread = Math.max(1, CURVE_COUNT - 1);
  const bandLevels = Array.from({ length: BAND_COUNT }, (unused, band) =>
    normalize(Float64Array.from(scanFrames, (scanFrame) => scanFrame[band] || 0))
  );

  const curves = Array.from({ length: CURVE_COUNT }, (unused, curveIndex) => {
    const depth = DEPTH_FLOOR + (1 - DEPTH_FLOOR) * (curveIndex / spread);
    const group = CURVE_COUNT - 1 - curveIndex;
    const first = Math.round((group * (BAND_COUNT - WAVE_COUNT)) / spread);

    return {
      waveLevels: Array.from({ length: WAVE_COUNT }, (unused, index) =>
        bandLevels[Math.min(BAND_COUNT - 1, first + index)]
      ),
      phase: curveIndex * CURVE_PHASE_STEP,
      rateScale: 1 + CURVE_SPEED_SPREAD * (curveIndex / spread),
      swingCeiling: SWING_EM * depth,
      lineWidth: LINE_WIDTH_PX,
      alpha: Math.pow(depth, ALPHA_FALLOFF),
      offset: SPREAD_TOTAL_EM * (curveIndex / spread - 0.5),
    };
  });

  const waveReach = new Float64Array(WAVE_COUNT);
  const waveAngle = new Float64Array(WAVE_COUNT);

  function strokeFor(color) {
    const gradient = canvasContext.createLinearGradient(spanStart, 0, spanStart + span, 0);

    gradient.addColorStop(0, fadeOf(color));
    gradient.addColorStop(FADE_FRACTION, color);
    gradient.addColorStop(1 - FADE_FRACTION, color);
    gradient.addColorStop(1, fadeOf(color));

    return gradient;
  }

  const diagonalMask = (function () {
    const tilt = canvasView.height * DIAGONAL_TILT;
    const mask = canvasContext.createLinearGradient(
      spanStart,
      baseline - tilt,
      spanStart + span,
      baseline + tilt
    );

    mask.addColorStop(0, "rgba(255, 255, 255, 1)");
    mask.addColorStop(1, "rgba(255, 255, 255, " + DIAGONAL_FLOOR + ")");

    return mask;
  })();

  let paintedAccent = null;
  let curveStroke = null;

  Renderer.start(context, (time) => {
    canvasView.apply(canvasContext);
    canvasContext.clearRect(0, 0, canvasView.width, canvasView.height);

    const anchor = parseFloat(getComputedStyle(screenElement).fontSize);


    if (context.colors.accent !== paintedAccent) {
      paintedAccent = context.colors.accent;
      curveStroke = strokeFor(paintedAccent);
    }

    canvasContext.lineCap = "round";
    canvasContext.lineJoin = "round";
    canvasContext.strokeStyle = curveStroke;

    curves.forEach((curve) => {
      const scanPosition = time / scanSeconds;

      for (let index = 0; index < WAVE_COUNT; index++) {
        const level = Math.min(1, Math.max(0, levelAt(curve.waveLevels[index], scanPosition)));

        waveReach[index] = (curve.swingCeiling * waveWeights[index] * level) / weightTotal;
        waveAngle[index] =
          curve.phase + index * WAVE_PHASE_STEP - waveRates[index] * curve.rateScale * time;
      }

      canvasContext.globalAlpha = curve.alpha;
      canvasContext.lineWidth = curve.lineWidth;
      canvasContext.beginPath();

      for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
        const position = positionAt(sample);
        let height = 0;

        for (let index = 0; index < WAVE_COUNT; index++) {
          height +=
            waveReach[index] * Math.sin(waveNumbers[index] * position + waveAngle[index]);
        }

        const x = spanStart + (span * sample) / (SAMPLE_COUNT - 1);
        const y = baseline + (curve.offset - height) * envelope[sample] * anchor;

        if (sample === 0) canvasContext.moveTo(x, y);
        else canvasContext.lineTo(x, y);
      }

      canvasContext.stroke();
    });

    canvasContext.globalAlpha = 1;
    canvasContext.globalCompositeOperation = "destination-in";
    canvasContext.fillStyle = diagonalMask;
    canvasContext.fillRect(0, 0, canvasView.width, canvasView.height);
    canvasContext.globalCompositeOperation = "source-over";
  });
})();
