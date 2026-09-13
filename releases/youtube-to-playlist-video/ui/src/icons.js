const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function definition(paths) {
  return { paths: paths, viewBox: "0 0 24 24" };
}

export const ICONS = {
  remove: definition([ "M18 6 6 18", "m6 6 12 12" ]),
  revert: definition([ "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5" ]),
  add: definition([ "M5 12h14", "M12 5v14" ]),
  check: definition([ "M20 6 9 17l-5-5" ]),
  chevron: definition([ "m6 9 6 6 6-6" ]),
};

export function icon(name) {
  const spec = ICONS[name];

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", spec.viewBox);
  svg.setAttribute("aria-hidden", "true");

  spec.paths.forEach((data) => {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", data);

    svg.appendChild(path);
  });

  return svg;
}
