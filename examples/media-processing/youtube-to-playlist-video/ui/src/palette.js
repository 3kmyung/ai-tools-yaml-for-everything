import { toChannels, toHex } from "./hex.js";

const SAMPLE_EDGE = 120;
const TARGET_COLORS = 6;

function loadImage(imageSource) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = imageSource;
  });
}

function samplePixels(image) {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_EDGE;
  canvas.height = SAMPLE_EDGE;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE);

  const rgbaBytes = context.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE).data;
  const pixels = [];
  for (let offset = 0; offset < rgbaBytes.length; offset += 4) {
    pixels.push([rgbaBytes[offset], rgbaBytes[offset + 1], rgbaBytes[offset + 2]]);
  }

  return pixels;
}

function channelRange(bucket, channelIndex) {
  let min = 255;
  let max = 0;
  bucket.forEach((pixel) => {
    const value = pixel[channelIndex];
    if (value < min) min = value;
    if (value > max) max = value;
  });
  return max - min;
}

function medianCutBuckets(pixels, targetCount) {
  const buckets = [pixels];

  while (buckets.length < targetCount) {
    let splitIndex = -1;
    let bestRange = 0;
    let bestChannelIndex = 0;

    buckets.forEach((bucket, index) => {
      if (bucket.length < 2) return;
      for (let channelIndex = 0; channelIndex < 3; channelIndex++) {
        const range = channelRange(bucket, channelIndex);
        if (range > bestRange) {
          bestRange = range;
          splitIndex = index;
          bestChannelIndex = channelIndex;
        }
      }
    });

    if (splitIndex === -1) break;

    const bucket = buckets[splitIndex];
    bucket.sort((a, b) => a[bestChannelIndex] - b[bestChannelIndex]);
    const middle = Math.floor(bucket.length / 2);
    buckets.splice(splitIndex, 1, bucket.slice(0, middle), bucket.slice(middle));
  }

  return buckets;
}

function averageChannels(bucket) {
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  bucket.forEach((pixel) => {
    redTotal += pixel[0];
    greenTotal += pixel[1];
    blueTotal += pixel[2];
  });
  return [
    Math.round(redTotal / bucket.length),
    Math.round(greenTotal / bucket.length),
    Math.round(blueTotal / bucket.length),
  ];
}

function nearestCentroidIndex(pixel, centroids) {
  let nearestIndex = 0;
  let nearestSquaredDistance = Infinity;
  for (let index = 0; index < centroids.length; index++) {
    const centroid = centroids[index];
    const redDelta = pixel[0] - centroid[0];
    const greenDelta = pixel[1] - centroid[1];
    const blueDelta = pixel[2] - centroid[2];
    const squaredDistance = redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta;
    if (squaredDistance < nearestSquaredDistance) {
      nearestSquaredDistance = squaredDistance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

function brightness(hex) {
  const channels = toChannels(hex);
  return (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
}

function dominantHexes(pixels, targetCount) {
  const buckets = medianCutBuckets(pixels, targetCount).filter((bucket) => bucket.length > 0);
  const centroids = buckets.map(averageChannels);
  const populations = new Array(centroids.length).fill(0);

  pixels.forEach((pixel) => {
    populations[nearestCentroidIndex(pixel, centroids)] += 1;
  });

  return centroids
    .map((centroid, index) => ({ centroid: centroid, population: populations[index] }))
    .sort((a, b) => b.population - a.population)
    .map((entry) => toHex(entry.centroid));
}

function assignRoles(hexes) {
  const primary = hexes[0] || "#111111";
  const remaining = hexes.slice(1).length ? hexes.slice(1) : ["#ffcc00"];

  const remainingByBrightness = remaining.slice().sort((a, b) => brightness(a) - brightness(b));
  if (brightness(primary) < 128) remainingByBrightness.reverse();

  const accent = remainingByBrightness[0];
  const secondary = remainingByBrightness.length > 1 ? remainingByBrightness[1] : accent;
  const text = brightness(primary) > 150 ? "#111111" : "#f5f5f0";

  return { primary: primary, secondary: secondary, accent: accent, text: text };
}

export async function extractPalette(imageSource) {
  const image = await loadImage(imageSource);
  if (!image) return null;

  const pixels = samplePixels(image);
  const hexes = dominantHexes(pixels, TARGET_COLORS);

  return Object.assign(assignRoles(hexes), { swatches: hexes });
}
