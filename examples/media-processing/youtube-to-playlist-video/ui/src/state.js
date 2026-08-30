import { extractPalette } from "./palette.js";

export function field(value, initial) {
  return { value: value !== undefined ? value : null, default: initial !== undefined ? initial : null };
}

export function effective(trackField) {
  return trackField.value != null ? trackField.value : trackField.default;
}

export function isOverridden(trackField) {
  return trackField.value !== null;
}

export function createTrack(id) {
  return {
    id: id,
    youtube_url: field(""),
    title: field(),
    artist: field(),
    cover: field(),
    primary_color: field(),
    secondary_color: field(),
    accent_color: field(),
    text_color: field(),
  };
}

const DEPENDENTS = {
  youtube_url: ["title", "artist", "cover"],
  cover: ["primary_color", "secondary_color", "accent_color", "text_color"],
};

const SOURCES = {
  youtube_url: async (track, api) => {
    const url = (effective(track.youtube_url) || "").trim();
    return url ? api.youtubeDefaults(url) : null;
  },
  cover: async (track) => {
    const cover = effective(track.cover);
    if (cover && !cover.colors) cover.colors = await extractPalette(cover.data_uri || cover.url);
    return cover;
  },
};

const DERIVE = {
  title: (source) => (source && source.title != null ? source.title : null),
  artist: (source) => (source && source.artist != null ? source.artist : null),
  cover: (source) => (source && source.cover != null ? source.cover : null),
  primary_color: (source) =>
    source && source.colors && source.colors.primary != null ? source.colors.primary : null,
  secondary_color: (source) =>
    source && source.colors && source.colors.secondary != null ? source.colors.secondary : null,
  accent_color: (source) =>
    source && source.colors && source.colors.accent != null ? source.colors.accent : null,
  text_color: (source) => (source && source.colors && source.colors.text != null ? source.colors.text : null),
};

const IDENTITY = {
  cover: (value) => (value && value.path != null ? value.path : null),
};

function identify(key, value) {
  const toIdentity = IDENTITY[key];
  return toIdentity ? toIdentity(value) : value != null ? value : null;
}

export async function invalidate(track, sourceKey, api) {
  const targets = DEPENDENTS[sourceKey];
  if (!targets) return;

  const source = await SOURCES[sourceKey](track, api);

  for (let index = 0; index < targets.length; index++) {
    const key = targets[index];
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

export async function setCover(track, ingested, api) {
  track.cover.value = ingested;
  await invalidate(track, "cover", api);
}
