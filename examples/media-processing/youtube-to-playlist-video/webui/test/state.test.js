import { test, assertEqual } from "./harness.js";
import { field, effective, isOverridden, createTrack, invalidate, revert, setCover } from "../state.js";

function ingested(name, primary, accent) {
  return {
    path: `covers/${name}.jpg`,
    url: `file:///covers/${name}.jpg`,
    data_uri: `data:image/jpeg;base64,${name}`,
    colors: { primary, secondary: "#222222", accent, text: "#f5f5f0" },
  };
}

// A stand-in for api.js. Records calls so tests can assert a source is
// fetched once per change rather than once per dependent field.
function fakeApi(videos) {
  const calls = [];
  return {
    calls,
    async youtubeDefaults(url) {
      calls.push(url);
      return videos[url];
    },
  };
}

const VIDEOS = {
  "https://youtu.be/aaa": {
    title: "Papillon",
    artist: "NMIXX",
    cover: ingested("aaa", "#ffffff", "#1d4ed8"),
  },
  "https://youtu.be/bbb": {
    title: "Dash",
    artist: "NMIXX",
    cover: ingested("bbb", "#101020", "#7ad7ff"),
  },
};

test("effective prefers the override, falls back to the default", () => {
  assertEqual(effective(field(null, "d")), "d");
  assertEqual(effective(field("v", "d")), "v");
  assertEqual(effective(field()), null);
});

test("isOverridden tracks whether a value was written over the default", () => {
  assertEqual(isOverridden(field(null, "d")), false);
  assertEqual(isOverridden(field("v", "d")), true);
  // An override that happens to equal the default is still an override —
  // otherwise the revert control would silently disappear as you typed.
  assertEqual(isOverridden(field("d", "d")), true);
});

test("a url resolves the title, artist and cover defaults", async () => {
  const api = fakeApi(VIDEOS);
  const track = createTrack("t1");
  track.youtube_url.value = "https://youtu.be/aaa";

  await invalidate(track, "youtube_url", api);

  assertEqual(effective(track.title), "Papillon");
  assertEqual(effective(track.artist), "NMIXX");
  assertEqual(effective(track.cover).path, "covers/aaa.jpg");
});

test("a url change cascades through the cover into the colors", async () => {
  const api = fakeApi(VIDEOS);
  const track = createTrack("t1");
  track.youtube_url.value = "https://youtu.be/aaa";
  await invalidate(track, "youtube_url", api);

  assertEqual(effective(track.primary_color), "#ffffff");
  assertEqual(effective(track.accent_color), "#1d4ed8");
});

test("the source is fetched once per change, not once per dependent field", async () => {
  const api = fakeApi(VIDEOS);
  const track = createTrack("t1");
  track.youtube_url.value = "https://youtu.be/aaa";

  await invalidate(track, "youtube_url", api);

  assertEqual(api.calls, ["https://youtu.be/aaa"]);
});

test("an overridden field survives a source change but its default refreshes", async () => {
  const api = fakeApi(VIDEOS);
  const track = createTrack("t1");
  track.youtube_url.value = "https://youtu.be/aaa";
  await invalidate(track, "youtube_url", api);

  track.title.value = "My Own Title";

  track.youtube_url.value = "https://youtu.be/bbb";
  await invalidate(track, "youtube_url", api);

  assertEqual(effective(track.title), "My Own Title");
  assertEqual(track.title.default, "Dash");
  assertEqual(effective(track.artist), "NMIXX");
});

test("reverting an overridden field yields the current source's value", async () => {
  const api = fakeApi(VIDEOS);
  const track = createTrack("t1");
  track.youtube_url.value = "https://youtu.be/aaa";
  await invalidate(track, "youtube_url", api);

  track.accent_color.value = "#ff0000";
  track.youtube_url.value = "https://youtu.be/bbb";
  await invalidate(track, "youtube_url", api);

  assertEqual(effective(track.accent_color), "#ff0000");

  await revert(track, "accent_color", api);

  assertEqual(effective(track.accent_color), "#7ad7ff");
});

test("an overridden cover stops the color cascade at itself", async () => {
  const api = fakeApi(VIDEOS);
  const track = createTrack("t1");
  track.youtube_url.value = "https://youtu.be/aaa";
  await invalidate(track, "youtube_url", api);

  await setCover(track, ingested("upload", "#0f0f0f", "#00ff88"), api);
  assertEqual(effective(track.primary_color), "#0f0f0f");
  assertEqual(effective(track.accent_color), "#00ff88");

  // Changing the video now refreshes the cover's default underneath, but the
  // effective cover is still the upload, so the colors must not move.
  track.youtube_url.value = "https://youtu.be/bbb";
  await invalidate(track, "youtube_url", api);

  assertEqual(effective(track.cover).path, "covers/upload.jpg");
  assertEqual(track.cover.default.path, "covers/bbb.jpg");
  assertEqual(effective(track.primary_color), "#0f0f0f");
  assertEqual(effective(track.accent_color), "#00ff88");
});

test("reverting the cover restores the video's palette", async () => {
  const api = fakeApi(VIDEOS);
  const track = createTrack("t1");
  track.youtube_url.value = "https://youtu.be/aaa";
  await invalidate(track, "youtube_url", api);
  await setCover(track, ingested("upload", "#0f0f0f", "#00ff88"), api);

  await revert(track, "cover", api);

  assertEqual(effective(track.cover).path, "covers/aaa.jpg");
  assertEqual(effective(track.primary_color), "#ffffff");
  assertEqual(effective(track.accent_color), "#1d4ed8");
});

test("an overridden cover's colors are not recomputed while the video underneath changes", async () => {
  // Value-based assertions can't tell a guarded recursion from an
  // unconditional one here: SOURCES.cover always reads the *effective*
  // cover, so re-deriving colors from an unchanged override reproduces the
  // same numbers. A read counter on the override's own palette is the only
  // way to observe whether the recompute happened at all.
  const api = fakeApi(VIDEOS);
  const track = createTrack("t1");
  track.youtube_url.value = "https://youtu.be/aaa";
  await invalidate(track, "youtube_url", api);

  let reads = 0;
  const upload = ingested("upload", "#0f0f0f", "#00ff88");
  Object.defineProperty(upload.colors, "primary", {
    get() {
      reads += 1;
      return "#0f0f0f";
    },
  });

  await setCover(track, upload, api);
  const readsAfterSetCover = reads;

  track.youtube_url.value = "https://youtu.be/bbb";
  await invalidate(track, "youtube_url", api);

  assertEqual(reads, readsAfterSetCover, "primary_color must not be re-derived while cover stays overridden");
});

test("an empty url clears the derived defaults without touching overrides", async () => {
  const api = fakeApi(VIDEOS);
  const track = createTrack("t1");
  track.youtube_url.value = "https://youtu.be/aaa";
  await invalidate(track, "youtube_url", api);

  track.artist.value = "Kept";
  track.youtube_url.value = "";
  await invalidate(track, "youtube_url", api);

  assertEqual(track.title.default, null);
  assertEqual(effective(track.title), null);
  assertEqual(effective(track.artist), "Kept");
  assertEqual(effective(track.primary_color), null);
  assertEqual(api.calls, ["https://youtu.be/aaa"]);
});
