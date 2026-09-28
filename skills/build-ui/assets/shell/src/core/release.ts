import type { LucideIcon } from "lucide-react";
import { createElement, type ComponentType, type ReactNode } from "react";
import type { Draft } from "./draft";
import type { Locale, Localized } from "./locale";
import type { InputValue, JobOutputs, RunRequest } from "./messages";

export type { Locale, Localized } from "./locale";

export interface StepLabel {
  job: string;
  label: Localized;
}

export interface WorkflowChoice {
  id: string;
  label: Localized;
  description: Localized;
  icon: LucideIcon;
  steps?: readonly StepLabel[];
}

export interface ScopedField {
  field: string;
  workflows?: readonly string[];
}

interface PromptFieldBase extends ScopedField {
  placeholder: Localized;
}

export interface RequiredPromptField extends PromptFieldBase {
  optional?: false;
  missing: Localized;
}

export interface OptionalPromptField extends PromptFieldBase {
  optional: true;
}

export type PromptField = RequiredPromptField | OptionalPromptField;

export interface FileSlot extends ScopedField {
  label: Localized;
  hint: Localized;
  accept: string;
  missing: Localized;
  canRecord?: boolean;
}

export interface OptionChoice {
  value: InputValue;
  label: Localized;
  description?: Localized;
}

export interface OptionField extends ScopedField {
  label: Localized;
  icon: LucideIcon;
  defaultValue: InputValue;
  choices: readonly OptionChoice[];
}

export interface FailureRule {
  reason: string;
  pattern: RegExp;
  title: Localized;
  hint: Localized;
}

export interface ControllerAddress {
  port: number;
  basePath: string;
}

export interface PlaybackFocus {
  playingId: string | null;
  onPlaybackStart: (playerId: string) => void;
}

export interface ReplyMeta {
  replyId: string;
  elapsedMilliseconds: number;
  outputs: JobOutputs;
  downloadName: string;
}

export interface ResultProps<Result> {
  result: Result;
  request: RunRequest;
  meta: ReplyMeta;
  playback: PlaybackFocus;
  locale: Locale;
  pick: (localized: Localized) => string;
}

export interface ReleaseDefinition<Result> {
  id: string;
  name: Localized;
  eyebrow: Localized;
  headline: readonly Localized[];
  caption: Localized;
  controller: ControllerAddress;
  workflows: readonly WorkflowChoice[];
  prompts?: readonly PromptField[];
  files?: readonly FileSlot[];
  options?: readonly OptionField[];
  failures?: readonly FailureRule[];
  findBlockedReason?: (draft: Draft) => Localized | null;
  buildInput?: (input: Record<string, unknown>, request: RunRequest) => Record<string, unknown>;
  readResult: (outputs: JobOutputs, request: RunRequest) => Result;
  ResultCard: ComponentType<ResultProps<Result>>;
  downloadName: (request: RunRequest) => string;
}

export interface Release extends Omit<ReleaseDefinition<unknown>, "readResult" | "ResultCard"> {
  readResult: (outputs: JobOutputs, request: RunRequest) => unknown;
  renderResult: (props: ResultProps<unknown>) => ReactNode;
}

export function defineRelease<Result>(definition: ReleaseDefinition<Result>): Release {
  const { ResultCard, ...rest } = definition;
  return { ...rest, renderResult: (props) => createElement(ResultCard, props as ResultProps<Result>) };
}
