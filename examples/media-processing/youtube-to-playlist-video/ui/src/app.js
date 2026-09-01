import { createApi } from "./api.js";
import { createTrack, effective } from "./state.js";
import { createPreview } from "./preview.js";
import { SCREEN_RATIOS, RESOLUTIONS } from "./ratios.js";
import { DEFAULT_TRACK_COLORS } from "./track-colors.js";
import { DEFAULT_RENDER_SETTINGS } from "./render-settings.js";
import { STYLE_BAND_COUNTS } from "./band-counts.js";
import { renderTrackList, markSelectedTrack } from "./track-list.js";
import { createEditor } from "./editor.js";
import { createRenderRunner } from "./render-runner.js";
import { icon } from "./icons.js";
import { setDropdown } from "./dropdown.js";

const RENDER_WORKFLOW_ID = "render-playlist";
const STORAGE_KEY = "youtube-to-playlist-video/state";
const HEAVY_PIXELS = 1920 * 1080;

const DEFAULT_SETTINGS = {
  style: DEFAULT_RENDER_SETTINGS.style,
  ratio: DEFAULT_RENDER_SETTINGS.ratio,
  width: DEFAULT_RENDER_SETTINGS.width,
  height: DEFAULT_RENDER_SETTINGS.height,
  fps: DEFAULT_RENDER_SETTINGS.fps,
};

const SCHEMA_SETTING_NAMES = {
  style: "style",
  fps: "fps",
  width: "width",
  height: "height",
};

const api = createApi();
const settings = Object.assign({}, DEFAULT_SETTINGS);

let STYLES = [];
let FPS = [];
let hasPersistedSettings = false;
let tracks = [];
let selectedId = null;
let nextId = 1;
let preview = null;

function getApi() {
  return api;
}

function bandCount() {
  return STYLE_BAND_COUNTS[settings.style];
}

function withoutCoverBlob(cover) {
  if (!cover) return cover != null ? cover : null;
  const rest = Object.assign({}, cover);
  delete rest.data_uri;
  return rest;
}

function persistable(track) {
  return Object.assign({}, track, {
    cover: {
      value: withoutCoverBlob(track.cover ? track.cover.value : null),
      default: withoutCoverBlob(track.cover ? track.cover.default : null),
    },
  });
}

function save() {
  const payload = JSON.stringify({ settings: settings, tracks: tracks.map(persistable), nextId: nextId });
  try {
    localStorage.setItem(STORAGE_KEY, payload);
  } catch (persistFailure) {}
}

function load() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch (parseFailure) {
    parsed = null;
  }
  if (!parsed) return null;
  return {
    settings: parsed.settings != null ? parsed.settings : null,
    tracks: (Array.isArray(parsed.tracks) ? parsed.tracks : []).map(withCurrentFields),
    nextId: parsed.nextId,
  };
}

function applySettings(persisted) {
  hasPersistedSettings = persisted != null;
  Object.assign(settings, persisted != null ? persisted : {});
  if (RESOLUTIONS[settings.ratio]) return;

  settings.ratio = DEFAULT_SETTINGS.ratio;
  const defaultResolution = RESOLUTIONS[settings.ratio][0];
  settings.width = defaultResolution[0];
  settings.height = defaultResolution[1];
}

function withCurrentFields(track) {
  const template = createTrack(track.id);
  Object.keys(template).forEach((key) => {
    if (!(key in track)) track[key] = template[key];
  });
  return track;
}

function resolutionKey(width, height) {
  return width + "x" + height;
}

function renderResolutions() {
  const options = RESOLUTIONS[settings.ratio];
  const current = resolutionKey(settings.width, settings.height);
  const match = options.find((option) => resolutionKey(option[0], option[1]) === current) || options[0];
  settings.width = match[0];
  settings.height = match[1];

  setDropdown(
    document.getElementById("resolution"),
    options.map((option) => resolutionKey(option[0], option[1])),
    resolutionKey(settings.width, settings.height)
  );

  const warning = document.getElementById("warning");
  const heavy = settings.width * settings.height > HEAVY_PIXELS;
  warning.hidden = !heavy;
  warning.textContent = heavy ? "Expect a long render" : "";
}

function renderSettings() {
  setDropdown(document.getElementById("style"), STYLES, settings.style);
  setDropdown(document.getElementById("ratio"), Object.keys(SCREEN_RATIOS), settings.ratio);
  setDropdown(document.getElementById("fps"), FPS, settings.fps);
  renderResolutions();
}

function selected() {
  return tracks.find((track) => track.id === selectedId) || null;
}

function addTrack() {
  const track = createTrack("t" + nextId++);
  tracks.push(track);
  selectedId = track.id;
  renderAll();
}

function removeTrack(id) {
  editor.cancelPending(id);

  tracks = tracks.filter((track) => track.id !== id);
  if (selectedId === id) selectedId = tracks[0] ? tracks[0].id : null;
  renderAll();
}

function selectTrack(id) {
  selectedId = id;
  markSelectedTrack(selectedId);
  renderAll({ list: false });
}

function renderPreview() {
  const track = selected();
  if (!track) {
    preview.clear();
    return;
  }

  const index = tracks.indexOf(track);

  const cover = effective(track.cover);
  preview.update({
    style: settings.style,
    ratio: settings.ratio,
    width: settings.width,
    height: settings.height,
    bandCount: bandCount(),
    fps: settings.fps,
    title: effective(track.title) || "Untitled",
    artist: effective(track.artist) || "Unknown Artist",
    track_index: index,
    cover: cover && cover.url != null ? cover.url : null,
    colors: trackColors(track),
  });
}

function trackColors(track) {
  return {
    primary: effective(track.primary_color) || DEFAULT_TRACK_COLORS.primary,
    secondary: effective(track.secondary_color) || DEFAULT_TRACK_COLORS.secondary,
    accent: effective(track.accent_color) || DEFAULT_TRACK_COLORS.accent,
    text: effective(track.text_color) || DEFAULT_TRACK_COLORS.text,
  };
}

function renderAll(options) {
  const withEditor = options && options.editor !== undefined ? options.editor : true;
  const withList = options && options.list !== undefined ? options.list : true;

  if (withList) renderTrackList(tracks, { selectedId: selectedId, onSelect: selectTrack, onRemove: removeTrack });
  if (withEditor) editor.render(selected());
  renderPreview();
  save();
}

function bindSettings() {
  document.getElementById("style").addEventListener("change", (event) => {
    settings.style = event.target.value;
    renderAll();
  });

  document.getElementById("ratio").addEventListener("change", (event) => {
    settings.ratio = event.target.value;
    renderResolutions();
    renderAll();
  });

  document.getElementById("resolution").addEventListener("change", (event) => {
    const parts = event.target.value.split("x").map(Number);
    settings.width = parts[0];
    settings.height = parts[1];
    renderResolutions();
    renderAll();
  });

  document.getElementById("fps").addEventListener("change", (event) => {
    settings.fps = Number(event.target.value);
    save();
  });
}

function bindActions() {
  const addTrackButton = document.getElementById("add-track");
  addTrackButton.prepend(icon("add"));
  addTrackButton.addEventListener("click", addTrack);

  document.getElementById("render-playlist").addEventListener("click", () => renderRunner.start());
}

export function buildRenderInput() {
  return {
    style: settings.style,
    fps: settings.fps,
    band_count: bandCount(),
    width: settings.width,
    height: settings.height,
    tracks: tracks.map((track) => {
      const cover = effective(track.cover);
      return {
        youtube_url: effective(track.youtube_url) || "",
        cover_image: cover && cover.path != null ? cover.path : null,
        title: effective(track.title) || "",
        artist: effective(track.artist) || "",
        colors: trackColors(track),
      };
    }),
  };
}

function declaredOptions(variable, parse) {
  const parseValue = parse || String;
  if (!variable || !variable.subtype) return null;
  return variable.subtype.split(",").map((option) => parseValue(option.trim()));
}

async function adoptWorkflowSchema() {
  let schema;
  try {
    schema = await api.workflowSchema(RENDER_WORKFLOW_ID);
  } catch (schemaFailure) {
    return;
  }

  const declared = new Map(
    (schema && schema.input ? schema.input : []).map((variable) => [variable.name, variable])
  );

  STYLES = declaredOptions(declared.get("style")) || [];
  FPS = declaredOptions(declared.get("fps"), Number) || [];

  Object.keys(SCHEMA_SETTING_NAMES).forEach((key) => {
    const name = SCHEMA_SETTING_NAMES[key];
    const declaredEntry = declared.get(name);
    const declaredDefault = declaredEntry ? declaredEntry.default : null;
    if (declaredDefault == null) return;

    const value =
      typeof DEFAULT_SETTINGS[key] === "number" ? Number(declaredDefault) : declaredDefault;
    if (Number.isNaN(value)) return;

    DEFAULT_SETTINGS[key] = value;
    if (!hasPersistedSettings) settings[key] = value;
  });

  if (STYLES.length && !STYLES.includes(settings.style)) settings.style = DEFAULT_SETTINGS.style;
  if (FPS.length && !FPS.includes(settings.fps)) settings.fps = DEFAULT_SETTINGS.fps;
  if (!hasPersistedSettings && !RESOLUTIONS[settings.ratio]) settings.ratio = DEFAULT_SETTINGS.ratio;
}

const editor = createEditor({
  getApi: getApi,
  getStyle: () => settings.style,
  onEdited: () => renderAll({ editor: false }),
  onResolved: () => renderAll(),
});

const renderRunner = createRenderRunner({
  getApi: getApi,
  buildInput: buildRenderInput,
  hasPendingResolves: () => editor.hasPendingResolves(),
});

preview = createPreview(document.getElementById("preview"));
bindSettings();
bindActions();

const persisted = load();
applySettings(persisted ? persisted.settings : null);
if (persisted) {
  tracks = persisted.tracks;
  nextId = persisted.nextId != null ? persisted.nextId : tracks.length + 1;
}
if (!tracks.length) addTrack();
if (selectedId == null) selectedId = tracks[0] ? tracks[0].id : null;

await adoptWorkflowSchema();
renderSettings();
renderAll();
renderRunner.reattach();
