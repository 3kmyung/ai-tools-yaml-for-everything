import { test, assertEqual, assertClose } from "./harness.js";

test("pickStage maps 1280x720 to the 16:9 logical stage at 1x", () => {
  const stage = Renderer.pickStage(1280, 720);
  assertEqual([stage.ratio, stage.orient, stage.width, stage.height], ["16:9", "landscape", 1280, 720]);
  assertClose(stage.scale, 1, 1e-9);
});

test("pickStage scales 3840x2160 onto the same 16:9 logical stage", () => {
  const stage = Renderer.pickStage(3840, 2160);
  assertEqual([stage.ratio, stage.width, stage.height], ["16:9", 1280, 720]);
  assertClose(stage.scale, 3, 1e-9);
});

test("pickStage recognises the portrait ratios", () => {
  assertEqual(Renderer.pickStage(1080, 1920).ratio, "9:16");
  assertEqual(Renderer.pickStage(1080, 1440).ratio, "3:4");
  assertEqual(Renderer.pickStage(1080, 1920).orient, "portrait");
  assertEqual(Renderer.pickStage(1080, 1440).orient, "portrait");
});

test("pickStage recognises 4:3 and 1:1", () => {
  assertEqual(Renderer.pickStage(1440, 1080).ratio, "4:3");
  assertEqual(Renderer.pickStage(1440, 1080).orient, "landscape");
  assertEqual(Renderer.pickStage(1080, 1080).ratio, "1:1");
  assertEqual(Renderer.pickStage(1080, 1080).orient, "square");
});

test("pickStage falls back to the nearest ratio for an off-preset size", () => {
  // 1600x900 is 16:9 exactly; 1600x1000 (1.6) is nearer 16:9 (1.778) than 4:3 (1.333).
  assertEqual(Renderer.pickStage(1600, 1000).ratio, "16:9");
});

test("pickStage defaults to 16:9 at 1x when given nothing", () => {
  const stage = Renderer.pickStage(undefined, undefined);
  assertEqual([stage.ratio, stage.width, stage.height], ["16:9", 1280, 720]);
  assertClose(stage.scale, 1, 1e-9);
});

import { RATIO_SIZES, RESOLUTIONS } from "../ratios.js";

test("the GUI's ratio table matches common.js's", () => {
  const fromRenderer = Object.fromEntries(
    Object.entries(Renderer.RATIOS).map(([name, spec]) => [name, { width: spec.width, height: spec.height }])
  );
  assertEqual(fromRenderer, RATIO_SIZES);
});

/*
 * RESOLUTIONS and Renderer.RATIOS are two hand-written tables describing the
 * same five shapes, and nothing at runtime notices when they drift: the GUI
 * would happily offer 1440x1920 under "3:4" while the template laid itself
 * out as 9:16, and the only symptom would be a frame that looks subtly wrong
 * at one resolution. Closing the loop — every offered resolution must come
 * back as its own ratio — turns the duplication into something a test owns.
 */
test("every resolution the GUI offers picks the logical stage of the ratio it is listed under", () => {
  for (const [ratio, sizes] of Object.entries(RESOLUTIONS)) {
    assertEqual(sizes.length > 0, true, `${ratio} must offer at least one resolution`);
    for (const [width, height] of sizes) {
      assertEqual(
        Renderer.pickStage(width, height).ratio,
        ratio,
        `${width}x${height} is listed under ${ratio}`
      );
    }
  }
});

test("every ratio the GUI offers has a resolution list, and vice versa", () => {
  assertEqual(Object.keys(RESOLUTIONS).sort(), Object.keys(RATIO_SIZES).sort());
});

/*
 * The first entry of each list is what renderResolutions() falls back to when
 * a persisted width/height no longer matches, so it has to be the ratio's own
 * logical stage rather than merely a size of the same shape.
 */
test("each resolution list starts at that ratio's logical stage size", () => {
  for (const [ratio, sizes] of Object.entries(RESOLUTIONS)) {
    assertEqual([ratio, sizes[0]], [ratio, [RATIO_SIZES[ratio].width, RATIO_SIZES[ratio].height]]);
  }
});
