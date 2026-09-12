if (!window.DEFAULT_RENDER_SETTINGS) {
  throw new Error(
    "templates/render-settings.js must be loaded before any module that imports src/render-settings.js"
  );
}

export const DEFAULT_RENDER_SETTINGS = window.DEFAULT_RENDER_SETTINGS;
