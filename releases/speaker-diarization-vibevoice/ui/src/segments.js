const CATEGORY_COUNT = 7;
const NON_SPEECH_TAG = /^\s*[\[(][^\])]*[\])]\s*$/;

export function segmentsFromResponse(response) {
  return response.map((segment) => ({
    text: segment.text ?? segment.Content,
    startTime: segment.start_time ?? segment.Start,
    endTime: segment.end_time ?? segment.End,
    speakerId: segment.speaker_id ?? segment.Speaker,
  }));
}

export function hasSpeaker(speakerId) {
  return Number.isInteger(speakerId);
}

export function isSpokenSegment(segment) {
  return !NON_SPEECH_TAG.test(segment.text || "");
}

export function firstSpokenIndex(segments) {
  const index = segments.findIndex(isSpokenSegment);

  if (index !== -1) return index;

  return segments.length > 0 ? 0 : null;
}

export function speakerCategory(speakerId) {
  return hasSpeaker(speakerId) ? String(speakerId % CATEGORY_COUNT + 1) : "";
}

export function speakerName(speakerId) {
  return hasSpeaker(speakerId) ? "Speaker " + (speakerId + 1) : "Unattributed";
}

export function compareSpeakers(first, second) {
  if (hasSpeaker(first) && hasSpeaker(second)) return first - second;

  return Number(hasSpeaker(second)) - Number(hasSpeaker(first));
}

export function formatTimestamp(seconds) {
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return minutes + ":" + String(remainingSeconds).padStart(2, "0");
}

export function formatRange(segment) {
  return formatTimestamp(segment.startTime) + "–" + formatTimestamp(segment.endTime);
}
