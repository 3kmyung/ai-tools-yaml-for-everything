const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function definition(paths) {
  return { paths: paths, viewBox: "0 0 24 24" };
}

export const ICONS = {
  upload: definition([ "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m17 8-5-5-5 5", "M12 3v12" ]),
};

export function icon(name) {
  const entry = ICONS[name];
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  const paths = entry.paths.map((data) => {
    const path = document.createElementNS(SVG_NAMESPACE, "path");

    path.setAttribute("d", data);

    return path;
  });

  svg.setAttribute("class", "icon");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("viewBox", entry.viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.append(...paths);

  return svg;
}
