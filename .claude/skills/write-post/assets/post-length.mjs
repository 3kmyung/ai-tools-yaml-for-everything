import { readFile } from "node:fs/promises";

const LIMIT = 280;
const URL_WEIGHT = 23;
const LIGHT_RANGES = [ [ 0x0000, 0x10ff ], [ 0x2000, 0x200d ], [ 0x2010, 0x201f ], [ 0x2032, 0x2037 ] ];
const URL_PATTERN = /https?:\/\/\S+/gu;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

function codePointWeight(codePoint) {
  return LIGHT_RANGES.some(([ start, end ]) => codePoint >= start && codePoint <= end) ? 1 : 2;
}

function graphemeWeight(grapheme) {
  if (EMOJI_PATTERN.test(grapheme)) return 2;

  return [ ...grapheme ].reduce((total, character) => total + codePointWeight(character.codePointAt(0)), 0);
}

function weightedLength(text) {
  const normalized = text.normalize("NFC");
  const urlCount = (normalized.match(URL_PATTERN) || []).length;
  const graphemes = new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(normalized.replace(URL_PATTERN, ""));

  const characterWeight = [ ...graphemes ].reduce((total, { segment }) => total + graphemeWeight(segment), 0);

  return characterWeight + urlCount * URL_WEIGHT;
}

const [ postPath ] = process.argv.slice(2);

if (!postPath) {
  console.error("usage: node post-length.mjs <post.txt>");
  process.exit(1);
}

const length = weightedLength((await readFile(postPath, "utf8")).trimEnd());

console.log(`${length}/${LIMIT}`);

if (length > LIMIT) process.exit(1);
