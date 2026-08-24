if (!window.SCREEN_RATIOS) {
  throw new Error("templates/ratios.js must be loaded before any module that imports src/ratios.js");
}

export const SCREEN_RATIOS = window.SCREEN_RATIOS;

export const RESOLUTIONS = {
  "16:9": [[1280, 720], [1920, 1080], [2560, 1440]],
  "4:3": [[960, 720], [1440, 1080], [1920, 1440]],
  "1:1": [[720, 720], [1080, 1080], [1440, 1440]],
  "3:4": [[720, 960], [1080, 1440], [1440, 1920]],
  "9:16": [[720, 1280], [1080, 1920], [1440, 2560]],
};
