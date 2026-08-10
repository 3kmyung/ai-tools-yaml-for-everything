/*
 * The GUI's copy of the stage table. It is deliberately a separate module
 * from common.js's copy: common.js is a classic script loaded by the
 * templates, and importing it here would mean loading the whole template
 * runtime into the GUI for five constants. The two must agree, and nothing
 * at runtime would notice if they stopped: test/stage.test.js pins
 * common.js's own table, and then asserts this one equals it. Change either
 * table and that test is what tells you the other did not follow.
 *
 * RESOLUTIONS is the second half of the same contract: every entry here has
 * to land back on its own ratio when the renderer picks a logical stage for
 * it, which the same test file asserts across the whole table.
 */
export const RATIO_SIZES = {
  "16:9": { width: 1280, height: 720 },
  "4:3": { width: 960, height: 720 },
  "1:1": { width: 720, height: 720 },
  "3:4": { width: 720, height: 960 },
  "9:16": { width: 720, height: 1280 },
};

export const RESOLUTIONS = {
  "16:9": [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]],
  "4:3": [[960, 720], [1440, 1080], [1920, 1440]],
  "1:1": [[720, 720], [1080, 1080], [1440, 1440]],
  "3:4": [[720, 960], [1080, 1440], [1440, 1920]],
  "9:16": [[720, 1280], [1080, 1920], [1440, 2560]],
};
