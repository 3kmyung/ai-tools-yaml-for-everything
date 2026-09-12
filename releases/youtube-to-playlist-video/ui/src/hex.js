export function toHex(channels) {
  return "#" + channels.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("");
}

export function toChannels(hex) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

export function isHex(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeHex(value) {
  const trimmed = String(value == null ? "" : value).trim();
  const prefixed = trimmed.startsWith("#") ? trimmed : "#" + trimmed;
  const expanded = /^#[0-9a-fA-F]{3}$/.test(prefixed)
    ? "#" + prefixed.slice(1).split("").map((digit) => digit + digit).join("")
    : prefixed;
  return isHex(expanded) ? expanded.toLowerCase() : null;
}
