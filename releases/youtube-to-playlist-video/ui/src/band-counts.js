if (!window.STYLE_BAND_COUNTS) {
  throw new Error("templates/band-counts.js must be loaded before any module that imports src/band-counts.js");
}

export const STYLE_BAND_COUNTS = window.STYLE_BAND_COUNTS;
