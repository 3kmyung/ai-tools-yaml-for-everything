const CATEGORY_COUNT = 7;
const NON_SPEECH_NAME = "Non-speech";

export function hasSpeaker(segment) {
  return Number.isFinite(segment.speaker_id);
}

export function speakerName(segment) {
  return hasSpeaker(segment) ? "Speaker " + (segment.speaker_id + 1) : NON_SPEECH_NAME;
}

export function categoryFor(segment) {
  return hasSpeaker(segment) ? String((Math.abs(segment.speaker_id) % CATEGORY_COUNT) + 1) : null;
}

export function laneKey(segment) {
  return hasSpeaker(segment) ? "speaker-" + segment.speaker_id : "none";
}

function unwrapOutput(output) {
  if (typeof output === "string") return unwrapOutput(JSON.parse(output));
  if (Array.isArray(output)) return output;
  if (output && output.transcription != null) return unwrapOutput(output.transcription);

  throw new Error("The model returned no segments.");
}

function normalizeSegment(raw) {
  const speaker = raw.speaker_id == null || raw.speaker_id === "" ? NaN : Number(raw.speaker_id);
  const segment = {
    text: raw.text == null ? "" : String(raw.text),
    start_time: Number(raw.start_time) || 0,
    end_time: Number(raw.end_time) || 0,
  };

  if (Number.isFinite(speaker)) segment.speaker_id = speaker;

  return segment;
}

export function readSegments(output) {
  const segments = unwrapOutput(output);

  return segments.map(normalizeSegment);
}

function createLane(segment) {
  return {
    key: laneKey(segment),
    name: speakerName(segment),
    category: categoryFor(segment),
    order: hasSpeaker(segment) ? segment.speaker_id : Number.MAX_SAFE_INTEGER,
    total: 0,
  };
}

export function summarizeSegments(segments) {
  const lanes = new Map();
  const duration = segments.reduce((latest, segment) => Math.max(latest, segment.end_time), 0);

  segments.forEach((segment) => {
    const lane = lanes.get(laneKey(segment)) || createLane(segment);

    lane.total += Math.max(0, segment.end_time - segment.start_time);
    lanes.set(lane.key, lane);
  });

  const ordered = [...lanes.values()].sort((first, second) => first.order - second.order);

  return {
    duration: duration,
    lanes: ordered,
    speakerCount: ordered.filter((lane) => lane.category !== null).length,
    withHours: duration >= 3600,
  };
}
