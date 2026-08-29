const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function definition(width, height, path) {
  return { width: width, height: height, path: path, viewBox: "0 0 " + width + " " + height };
}

export const ICONS = {
  remove: definition(16, 16, "M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"),
  revert: definition(16, 16, "M3.75 10.21A4.5 4.5 0 1 0 3.75 6.12M6.48 5.49L3.75 6.12L4.19 3.35"),
  add: definition(16, 16, "M8.5 4.5V12.5M4.5 8.5H12.5"),
};

export function icon(name) {
  const spec = ICONS[name];

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("width", spec.width);
  svg.setAttribute("height", spec.height);
  svg.setAttribute("viewBox", spec.viewBox);
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", spec.path);
  svg.appendChild(path);

  return svg;
}
