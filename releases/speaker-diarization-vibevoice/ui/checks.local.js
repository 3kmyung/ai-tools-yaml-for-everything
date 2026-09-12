import { contrast, escapeRegExp, requireTokenColor, stylesheetSource } from "./checks.js";

const speakerColorDistanceFloor = 20;
const referenceWhite = [ 0.95047, 1, 1.08883 ];

function paintedRotatedAccent(frameDocument, frameWindow, angleDegrees) {
  const probe = frameDocument.createElement("span");
  probe.className = "category-swatch";
  probe.style.position = "fixed";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  probe.style.setProperty("--category-hue", angleDegrees + "deg");

  frameDocument.body.appendChild(probe);

  const probeStyle = frameWindow.getComputedStyle(probe);
  const baseColor = probeStyle.backgroundColor;
  const filterValue = probeStyle.filter;

  const canvas = frameDocument.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;

  const context = canvas.getContext("2d");
  context.filter = filterValue;
  context.fillStyle = baseColor;
  context.fillRect(0, 0, 1, 1);

  const [ red, green, blue ] = context.getImageData(0, 0, 1, 1).data;

  probe.remove();

  return `rgb(${red}, ${green}, ${blue})`;
}

function linearChannel(value) {
  const normalized = value / 255;

  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function labFromColor(color) {
  const [ red, green, blue ] = color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

  const linearRed = linearChannel(red);
  const linearGreen = linearChannel(green);
  const linearBlue = linearChannel(blue);

  const x = linearRed * 0.4124564 + linearGreen * 0.3575761 + linearBlue * 0.1804375;
  const y = linearRed * 0.2126729 + linearGreen * 0.7151522 + linearBlue * 0.0721750;
  const z = linearRed * 0.0193339 + linearGreen * 0.1191920 + linearBlue * 0.9503041;

  const fx = labPivot(x / referenceWhite[0]);
  const fy = labPivot(y / referenceWhite[1]);
  const fz = labPivot(z / referenceWhite[2]);

  return [ 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz) ];
}

function labPivot(value) {
  const delta = 6 / 29;

  return value > delta ** 3 ? Math.cbrt(value) : value / (3 * delta * delta) + 4 / 29;
}

function ciede2000(labFirst, labSecond) {
  const [ lightnessFirst, aFirst, bFirst ] = labFirst;
  const [ lightnessSecond, aSecond, bSecond ] = labSecond;

  const chromaFirst = Math.sqrt(aFirst * aFirst + bFirst * bFirst);
  const chromaSecond = Math.sqrt(aSecond * aSecond + bSecond * bSecond);
  const chromaMean = (chromaFirst + chromaSecond) / 2;

  const chromaCorrection = 0.5 * (1 - Math.sqrt(chromaMean ** 7 / (chromaMean ** 7 + 25 ** 7)));

  const aFirstPrime = aFirst * (1 + chromaCorrection);
  const aSecondPrime = aSecond * (1 + chromaCorrection);

  const chromaFirstPrime = Math.sqrt(aFirstPrime * aFirstPrime + bFirst * bFirst);
  const chromaSecondPrime = Math.sqrt(aSecondPrime * aSecondPrime + bSecond * bSecond);

  const hueFirstPrime = (Math.atan2(bFirst, aFirstPrime) + 2 * Math.PI) % (2 * Math.PI);
  const hueSecondPrime = (Math.atan2(bSecond, aSecondPrime) + 2 * Math.PI) % (2 * Math.PI);

  const deltaLightnessPrime = lightnessSecond - lightnessFirst;
  const deltaChromaPrime = chromaSecondPrime - chromaFirstPrime;

  const chromaProduct = chromaFirstPrime * chromaSecondPrime;
  const hueDifference = hueSecondPrime - hueFirstPrime;

  let deltaHuePrime;
  if (chromaProduct === 0) deltaHuePrime = 0;
  else if (Math.abs(hueDifference) <= Math.PI) deltaHuePrime = hueDifference;
  else if (hueDifference > Math.PI) deltaHuePrime = hueDifference - 2 * Math.PI;
  else deltaHuePrime = hueDifference + 2 * Math.PI;

  const deltaChromaHuePrime = 2 * Math.sqrt(chromaProduct) * Math.sin(deltaHuePrime / 2);

  const lightnessMeanPrime = (lightnessFirst + lightnessSecond) / 2;
  const chromaMeanPrime = (chromaFirstPrime + chromaSecondPrime) / 2;
  const hueSum = hueFirstPrime + hueSecondPrime;

  let hueMeanPrime;
  if (chromaProduct === 0) hueMeanPrime = hueSum;
  else if (Math.abs(hueFirstPrime - hueSecondPrime) <= Math.PI) hueMeanPrime = hueSum / 2;
  else if (hueSum < 2 * Math.PI) hueMeanPrime = (hueSum + 2 * Math.PI) / 2;
  else hueMeanPrime = (hueSum - 2 * Math.PI) / 2;

  const toDegrees = (angleInRadians) => (angleInRadians * 180) / Math.PI;
  const toRadians = (angleInDegrees) => (angleInDegrees * Math.PI) / 180;

  const hueWeighting = 1
    - 0.17 * Math.cos(hueMeanPrime - toRadians(30))
    + 0.24 * Math.cos(2 * hueMeanPrime)
    + 0.32 * Math.cos(3 * hueMeanPrime + toRadians(6))
    - 0.20 * Math.cos(4 * hueMeanPrime - toRadians(63));

  const hueRotationAngle = toRadians(30) * Math.exp(-(((toDegrees(hueMeanPrime) - 275) / 25) ** 2));
  const hueRotationTerm = 2 * Math.sqrt(chromaMeanPrime ** 7 / (chromaMeanPrime ** 7 + 25 ** 7));

  const lightnessScale = 1 + (0.015 * (lightnessMeanPrime - 50) ** 2) / Math.sqrt(20 + (lightnessMeanPrime - 50) ** 2);
  const chromaScale = 1 + 0.045 * chromaMeanPrime;
  const hueScale = 1 + 0.015 * chromaMeanPrime * hueWeighting;

  const crossTerm = -Math.sin(2 * hueRotationAngle) * hueRotationTerm;

  const lightnessTerm = deltaLightnessPrime / lightnessScale;
  const chromaTerm = deltaChromaPrime / chromaScale;
  const hueTerm = deltaChromaHuePrime / hueScale;

  return Math.sqrt(lightnessTerm ** 2 + chromaTerm ** 2 + hueTerm ** 2 + crossTerm * chromaTerm * hueTerm);
}

export const CHECKS = [
  {
    name: "#transcribe rendered text meets 4.5:1 against its rendered fill",
    run: (frameDocument, frameWindow) => {
      const button = frameDocument.getElementById("transcribe");

      if (!button) return "#transcribe not found";

      const style = frameWindow.getComputedStyle(button);
      const ratio = contrast(style.color, style.backgroundColor);

      return ratio >= 4.5 ? true : `ratio ${ratio.toFixed(2)}`;
    },
  },
  {
    name: "#hint does not use --disabled",
    run: (frameDocument, frameWindow) => {
      const hint = frameDocument.getElementById("hint");
      const background = requireTokenColor(frameDocument, frameWindow, "--background");

      if (!hint) return "#hint not found";
      if (background.missing) return `${background.name} is not defined`;

      const ratio = contrast(frameWindow.getComputedStyle(hint).color, background.color);

      return ratio >= 4.5 ? true : `ratio ${ratio.toFixed(2)}`;
    },
  },
  {
    name: "components.css carries no domain nouns",
    run: async () => {
      const source = await stylesheetSource("./styles/components.css");
      const offenders = [ ...source.matchAll(/\.[\w-]*(?:speaker|transcript|meeting)[\w-]*/g) ].map((match) => match[0]);

      return offenders.length === 0 ? true : offenders.join(", ");
    },
  },
  {
    name: "the component vocabulary is present",
    run: async () => {
      const source = await stylesheetSource("./styles/components.css");
      const required = [
        ".action-primary", ".action-cancel",
        ".caption-warning", ".status-message", ".item", ".item-label",
      ];
      const missing = required.filter((name) => !new RegExp(`${escapeRegExp(name)}(?![\\w-])`).test(source));

      return missing.length === 0 ? true : missing.join(", ");
    },
  },
  {
    name: "every speaker's hue-rotate angle clears 3:1 against --background and --background-panel",
    run: async (frameDocument, frameWindow) => {
      const { SPEAKER_HUES } = await import("./src/segments.js");

      const background = requireTokenColor(frameDocument, frameWindow, "--background");
      const backgroundPanel = requireTokenColor(frameDocument, frameWindow, "--background-panel");

      if (background.missing) return `${background.name} is not defined`;
      if (backgroundPanel.missing) return `${backgroundPanel.name} is not defined`;

      const failures = [];

      for (const angleDegrees of SPEAKER_HUES) {
        const painted = paintedRotatedAccent(frameDocument, frameWindow, angleDegrees);

        const onBackground = contrast(painted, background.color);
        const onBackgroundPanel = contrast(painted, backgroundPanel.color);

        if (onBackground < 3) failures.push(`${angleDegrees}deg on --background is ${onBackground.toFixed(2)}`);
        if (onBackgroundPanel < 3) failures.push(`${angleDegrees}deg on --background-panel is ${onBackgroundPanel.toFixed(2)}`);
      }

      return failures.length === 0 ? true : failures.join(" / ");
    },
  },
  {
    name: `every pair of speaker colours clears a CIEDE2000 of ${speakerColorDistanceFloor} from each other`,
    run: async (frameDocument, frameWindow) => {
      const { SPEAKER_HUES } = await import("./src/segments.js");

      const labsByHue = SPEAKER_HUES.map((angleDegrees) => labFromColor(paintedRotatedAccent(frameDocument, frameWindow, angleDegrees)));

      const failures = [];

      for (let firstIndex = 0; firstIndex < SPEAKER_HUES.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < SPEAKER_HUES.length; secondIndex += 1) {
          const distance = ciede2000(labsByHue[firstIndex], labsByHue[secondIndex]);

          if (distance < speakerColorDistanceFloor) {
            failures.push(`${SPEAKER_HUES[firstIndex]}deg vs ${SPEAKER_HUES[secondIndex]}deg is ${distance.toFixed(2)}`);
          }
        }
      }

      return failures.length === 0 ? true : failures.join(" / ");
    },
  },
];
