const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export const ICONS = {
  "chevron-down": {
    paths: ["m6 9 6 6 6-6"],
    viewBox: "0 0 24 24",
  },
  download: {
    paths: ["M12 15V3", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5"],
    viewBox: "0 0 24 24",
  },
  "rotate-ccw": {
    paths: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
    viewBox: "0 0 24 24",
  },
  upload: {
    paths: ["M12 3v12", "m17 8-5-5-5 5", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"],
    viewBox: "0 0 24 24",
  },
};

function createPath(data) {
  const path = document.createElementNS(SVG_NAMESPACE, "path");

  path.setAttribute("d", data);

  return path;
}

export function fillIcon(svg, name) {
  const icon = ICONS[name];

  svg.setAttribute("viewBox", icon.viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.replaceChildren(...icon.paths.map(createPath));

  return svg;
}

export function createIcon(name) {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");

  svg.setAttribute("class", "icon");

  return fillIcon(svg, name);
}

export function hydrateIcons(root) {
  const placeholders = root.querySelectorAll("svg[data-icon]");

  placeholders.forEach((svg) => fillIcon(svg, svg.dataset.icon));
}
