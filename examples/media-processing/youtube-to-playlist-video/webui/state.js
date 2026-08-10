/*
 * The track model and the rule that makes the whole UI work: every field is a
 * default that something else computed plus an optional value the user wrote
 * over it. A source change recomputes defaults and never touches values, so an
 * edit survives until it is explicitly reverted.
 */

export function field(value = null, initial = null) {
  return { value, default: initial };
}

export function effective(f) {
  return f.value ?? f.default;
}

export function isOverridden(f) {
  return f.value !== null;
}

export function createTrack(id) {
  return {
    id,
    // The one field with no source of its own — it is always what the user typed.
    youtube_url: field(""),
    title: field(),
    artist: field(),
    cover: field(),
    primary_color: field(),
    accent_color: field(),
  };
}

export const DEPS = {
  youtube_url: ["title", "artist", "cover"],
  cover: ["primary_color", "accent_color"],
};

/*
 * Loading a source is separate from deriving each field off it so that one
 * change costs one network call rather than one per dependent field. `cover`
 * needs no call at all: an ingested cover already carries its palette, which
 * is what makes "the user uploaded an image" and "the video's thumbnail
 * changed" the same code path from here on.
 */
const SOURCES = {
  youtube_url: async (track, api) => {
    const url = (effective(track.youtube_url) || "").trim();
    return url ? api.youtubeDefaults(url) : null;
  },
  cover: async (track) => effective(track.cover),
};

const DERIVE = {
  title: (source) => source?.title ?? null,
  artist: (source) => source?.artist ?? null,
  cover: (source) => source?.cover ?? null,
  primary_color: (source) => source?.colors?.primary ?? null,
  accent_color: (source) => source?.colors?.accent ?? null,
};

/*
 * Object-valued fields need an identity to compare against, or the cascade
 * would re-fire on every pass because two structurally equal covers are not
 * the same reference.
 */
const IDENTITY = {
  cover: (value) => value?.path ?? null,
};

function identify(key, value) {
  const of = IDENTITY[key];
  return of ? of(value) : value ?? null;
}

/*
 * Refreshes the defaults of everything downstream of `sourceKey`.
 *
 * An override survives because of two things together, not because of this
 * recursion: `effective()` always prefers `value` over `default`, and every
 * step below writes only `track[key].default`, never `.value`. Extending
 * DEPS or SOURCES has to preserve that second part — a recursive step that
 * wrote `.value` would clobber the user's override on the next cascade.
 *
 * The guard on the recursion (skip a target whose effective value didn't
 * move) is a work-avoidance optimization, not the survival rule: in this
 * graph `SOURCES.cover` is a pure function of `effective(track.cover)`, so
 * recursing into an unchanged cover would just recompute the same colors.
 * It also stands ready for a future SOURCES entry that isn't pure with
 * respect to its own key's effective value.
 */
export async function invalidate(track, sourceKey, api) {
  const targets = DEPS[sourceKey];
  if (!targets) return;

  const source = await SOURCES[sourceKey](track, api);

  for (const key of targets) {
    const before = identify(key, effective(track[key]));
    track[key].default = DERIVE[key](source);
    if (identify(key, effective(track[key])) !== before) {
      await invalidate(track, key, api);
    }
  }
}

export async function revert(track, key, api) {
  track[key].value = null;
  await invalidate(track, key, api);
}

/*
 * A user-supplied cover. `ingested` is whatever resolve-cover-defaults
 * returned, which is the same shape resolve-youtube-defaults puts in `cover`.
 */
export async function setCover(track, ingested, api) {
  track.cover.value = ingested;
  await invalidate(track, "cover", api);
}
