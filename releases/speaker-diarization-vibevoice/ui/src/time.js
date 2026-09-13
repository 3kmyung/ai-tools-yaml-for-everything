function pad(value, width) {
  return String(value).padStart(width, "0");
}

export function splitSeconds(seconds) {
  const totalMilliseconds = Math.max(0, Math.round(Number(seconds) * 1000)) || 0;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);

  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
    milliseconds: totalMilliseconds % 1000,
  };
}

export function cueTimestamp(seconds, separator) {
  const parts = splitSeconds(seconds);
  const clock = [pad(parts.hours, 2), pad(parts.minutes, 2), pad(parts.seconds, 2)].join(":");

  return clock + separator + pad(parts.milliseconds, 3);
}

export function plainTimestamp(seconds) {
  const parts = splitSeconds(seconds);

  return [parts.hours, pad(parts.minutes, 2), pad(parts.seconds, 2)].join(":");
}

export function clockLabel(seconds, withHours) {
  const parts = splitSeconds(seconds);

  if (withHours) return plainTimestamp(seconds);

  return [parts.hours * 60 + parts.minutes, pad(parts.seconds, 2)].join(":");
}
