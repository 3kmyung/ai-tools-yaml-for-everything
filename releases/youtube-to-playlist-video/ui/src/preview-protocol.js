if (!window.PREVIEW_MESSAGES) {
  throw new Error("templates/preview-protocol.js must be loaded before any module that imports src/preview-protocol.js");
}

export const PREVIEW_MESSAGES = window.PREVIEW_MESSAGES;
