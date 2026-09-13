import { hasSpeaker } from "./segments.js";

const FALLBACK_STEM = "speaker-diarization-vibevoice";

function splitTime(seconds) {
  const totalMilliseconds = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor(totalMilliseconds / 60000) % 60;
  const wholeSeconds = Math.floor(totalMilliseconds / 1000) % 60;
  const milliseconds = totalMilliseconds % 1000;

  return { hours, minutes, wholeSeconds, milliseconds };
}

function pad(value, length) {
  return String(value).padStart(length, "0");
}

function cueTime(seconds, fractionSeparator) {
  const parts = splitTime(seconds);

  return pad(parts.hours, 2) + ":" + pad(parts.minutes, 2) + ":" + pad(parts.wholeSeconds, 2) + fractionSeparator + pad(parts.milliseconds, 3);
}

function plainTime(seconds) {
  const parts = splitTime(Math.floor(Number(seconds) || 0));

  return parts.hours + ":" + pad(parts.minutes, 2) + ":" + pad(parts.wholeSeconds, 2);
}

function speakerLabel(segment) {
  return "Speaker " + (segment.speakerId + 1);
}

function labelledText(segment) {
  const text = segment.text || "";

  return hasSpeaker(segment.speakerId) ? speakerLabel(segment) + ": " + text : text;
}

export function transcriptJson(segments) {
  const records = segments.map((segment) => ({
    text: segment.text ?? "",
    start_time: segment.startTime,
    end_time: segment.endTime,
    speaker_id: hasSpeaker(segment.speakerId) ? segment.speakerId : null,
  }));

  return JSON.stringify(records, null, 2) + "\n";
}

export function transcriptSrt(segments) {
  const cues = segments.map((segment, index) => {
    const timing = cueTime(segment.startTime, ",") + " --> " + cueTime(segment.endTime, ",");

    return String(index + 1) + "\n" + timing + "\n" + labelledText(segment) + "\n\n";
  });

  return cues.join("");
}

export function transcriptVtt(segments) {
  const cues = segments.map((segment) => {
    const timing = cueTime(segment.startTime, ".") + " --> " + cueTime(segment.endTime, ".");
    const text = segment.text || "";
    const voiced = hasSpeaker(segment.speakerId) ? "<v " + speakerLabel(segment) + ">" + text : text;

    return timing + "\n" + voiced + "\n\n";
  });

  return "WEBVTT\n\n" + cues.join("");
}

export function transcriptTxt(segments) {
  const lines = segments.map((segment) => {
    const range = "[" + plainTime(segment.startTime) + " - " + plainTime(segment.endTime) + "]";

    return range + " " + labelledText(segment) + "\n";
  });

  return lines.join("");
}

export const TRANSCRIPT_FORMATS = [
  { label: "JSON", extension: "json", type: "application/json", build: transcriptJson },
  { label: "SRT", extension: "srt", type: "application/x-subrip", build: transcriptSrt },
  { label: "VTT", extension: "vtt", type: "text/vtt", build: transcriptVtt },
  { label: "TXT", extension: "txt", type: "text/plain", build: transcriptTxt },
];

export function transcriptStem(fileName) {
  const name = typeof fileName === "string" ? fileName.trim() : "";
  const extensionStart = name.lastIndexOf(".");
  const stem = extensionStart > 0 ? name.slice(0, extensionStart) : name;

  return stem || FALLBACK_STEM;
}
