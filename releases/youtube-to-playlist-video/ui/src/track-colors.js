if (!window.DEFAULT_TRACK_COLORS) {
  throw new Error("templates/track-colors.js must be loaded before any module that imports src/track-colors.js");
}

export const DEFAULT_TRACK_COLORS = window.DEFAULT_TRACK_COLORS;
