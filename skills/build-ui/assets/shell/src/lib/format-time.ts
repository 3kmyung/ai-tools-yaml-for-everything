import type { Locale } from "../core/locale";
import { fillTemplate, SHELL_STRINGS } from "../i18n/dictionaries";

const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * 1024;
const CENTISECONDS_PER_SECOND = 100;
const CENTISECONDS_PER_MINUTE = CENTISECONDS_PER_SECOND * 60;

function toSafeSeconds(totalSeconds: number): number {
  return Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
}

function toCentiseconds(totalSeconds: number): number {
  return Math.round(toSafeSeconds(totalSeconds) * CENTISECONDS_PER_SECOND);
}

export function formatSeconds(totalSeconds: number, locale: Locale): string {
  const value = (toCentiseconds(totalSeconds) / CENTISECONDS_PER_SECOND).toFixed(2);
  return fillTemplate(SHELL_STRINGS[locale].result.seconds, { value });
}

export function formatPreciseClock(totalSeconds: number): string {
  const centiseconds = toCentiseconds(totalSeconds);
  const minutes = Math.floor(centiseconds / CENTISECONDS_PER_MINUTE);
  const seconds = (centiseconds % CENTISECONDS_PER_MINUTE) / CENTISECONDS_PER_SECOND;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

export function formatClock(totalSeconds: number): string {
  const safeSeconds = toSafeSeconds(totalSeconds);
  const wholeSeconds = Math.floor(safeSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatRunTime(elapsedMilliseconds: number, locale: Locale): string {
  const strings = SHELL_STRINGS[locale].result;
  const seconds = elapsedMilliseconds / 1000;
  const duration = seconds < 60 ? fillTemplate(strings.seconds, { value: seconds.toFixed(1) }) : formatClock(seconds);
  return fillTemplate(strings.completedIn, { duration });
}

export function formatFileSize(bytes: number): string {
  if (bytes >= MEGABYTE) return `${(bytes / MEGABYTE).toFixed(1)}MB`;
  if (bytes >= KILOBYTE) return `${Math.round(bytes / KILOBYTE)}KB`;
  return `${bytes}B`;
}
