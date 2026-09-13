import { hasSpeaker, speakerName } from "./segments.js";
import { cueTimestamp, plainTimestamp } from "./time.js";

export const EXAMPLE_NAME = "speaker-diarization-vibevoice";

function singleLine(text) {
  return String(text).replace(/\s*\n\s*/g, " ");
}

function escapeCueText(text) {
  return singleLine(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attributedText(segment) {
  const text = singleLine(segment.text);

  return hasSpeaker(segment) ? speakerName(segment) + ": " + text : text;
}

function toRecord(segment) {
  const record = { text: segment.text, start_time: segment.start_time, end_time: segment.end_time };

  if (hasSpeaker(segment)) record.speaker_id = segment.speaker_id;

  return record;
}

export function toJson(segments) {
  const records = segments.map(toRecord);

  return JSON.stringify(records, null, 2) + "\n";
}

function srtCue(segment, index) {
  const range = cueTimestamp(segment.start_time, ",") + " --> " + cueTimestamp(segment.end_time, ",");

  return [String(index + 1), range, attributedText(segment)].join("\n");
}

export function toSrt(segments) {
  const cues = segments.map(srtCue);

  return cues.length ? cues.join("\n\n") + "\n" : "";
}

function vttCue(segment) {
  const range = cueTimestamp(segment.start_time, ".") + " --> " + cueTimestamp(segment.end_time, ".");
  const text = escapeCueText(segment.text);
  const voiced = hasSpeaker(segment) ? "<v " + speakerName(segment) + ">" + text : text;

  return range + "\n" + voiced;
}

export function toVtt(segments) {
  const cues = segments.map(vttCue);

  return ["WEBVTT", ...cues].join("\n\n") + "\n";
}

function txtLine(segment) {
  const range = "[" + plainTimestamp(segment.start_time) + " - " + plainTimestamp(segment.end_time) + "]";

  return range + " " + attributedText(segment);
}

export function toTxt(segments) {
  const lines = segments.map(txtLine);

  return lines.length ? lines.join("\n") + "\n" : "";
}

export function fileStem(fileName) {
  const dot = fileName.lastIndexOf(".");

  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

export const FORMATS = [
  { label: "JSON", extension: "json", type: "application/json", serialize: toJson },
  { label: "SRT", extension: "srt", type: "application/x-subrip", serialize: toSrt },
  { label: "VTT", extension: "vtt", type: "text/vtt", serialize: toVtt },
  { label: "TXT", extension: "txt", type: "text/plain", serialize: toTxt },
];
