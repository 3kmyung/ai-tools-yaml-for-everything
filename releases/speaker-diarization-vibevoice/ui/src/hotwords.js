export function normalizeHotwords(rawValue) {
  const terms = rawValue
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);

  return terms.join(",");
}

export function readHotwords(input) {
  return normalizeHotwords(input.value);
}
