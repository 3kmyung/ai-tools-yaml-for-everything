if (!window.STYLE_COLOR_ROLES) {
  throw new Error("templates/color-roles.js must be loaded before any module that imports src/color-roles.js");
}

export const STYLE_COLOR_ROLES = window.STYLE_COLOR_ROLES;
