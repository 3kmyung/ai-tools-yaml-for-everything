import { SHELL_STRINGS } from "../i18n/dictionaries";
import { DEFAULT_LOCALE, pickLocalized, type Locale } from "./locale";
import type { FailureRule } from "./release";

export interface FailureCopy {
  title: string;
  hint: string;
}

export type ShellFailureReason = "server" | "network" | "cancelled" | "unanswered" | "missing-file" | "unreadable-output";

const DETAIL_MAX_LENGTH = 240;

const NETWORK_PATTERN = /could not be reached|connection to the server was lost/i;

export class RunFailure extends Error {
  readonly reason: string;
  readonly detail: string;

  constructor(reason: string, detail: string) {
    super(`${reason}: ${detail}`);
    this.name = "RunFailure";
    this.reason = reason;
    this.detail = detail;
  }
}

function isShellReason(reason: string): reason is ShellFailureReason {
  return Object.hasOwn(SHELL_STRINGS[DEFAULT_LOCALE].failures, reason);
}

export function summarizeDetail(detail: string): string {
  const message = detail.split(/\s*Traceback[: ]/)[0]?.trim() ?? "";
  return message.length > DETAIL_MAX_LENGTH ? `${message.slice(0, DETAIL_MAX_LENGTH)}…` : message;
}

export function classifyServerDetail(detail: string, rules: readonly FailureRule[] = []): string {
  return rules.find((rule) => rule.pattern.test(detail))?.reason ?? "server";
}

export function failureFromServerDetail(detail: string, rules: readonly FailureRule[] = []): RunFailure {
  return new RunFailure(classifyServerDetail(detail, rules), summarizeDetail(detail));
}

export function toRunFailure(error: unknown, rules: readonly FailureRule[] = []): RunFailure {
  if (error instanceof RunFailure) return error;
  const detail = error instanceof Error ? error.message : String(error);
  if (NETWORK_PATTERN.test(detail)) return new RunFailure("network", detail);
  return failureFromServerDetail(detail, rules);
}

export function describeFailure(reason: string, locale: Locale, rules: readonly FailureRule[] = []): FailureCopy {
  const rule = rules.find((candidate) => candidate.reason === reason);
  if (rule) return { title: pickLocalized(rule.title, locale), hint: pickLocalized(rule.hint, locale) };
  const shellFailures = SHELL_STRINGS[locale].failures;
  return isShellReason(reason) ? shellFailures[reason] : shellFailures.server;
}
