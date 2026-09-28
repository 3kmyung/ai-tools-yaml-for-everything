import { File as FileIcon, FileAudio, FileImage, FileVideo, Mic, Square, X, type LucideIcon } from "lucide-react";
import type { ChangeEvent } from "react";
import type { FileSlot } from "../../core/release";
import { fillTemplate } from "../../i18n/dictionaries";
import { useLocale } from "../../i18n/locale-context";
import { classNames } from "../../lib/class-names";
import { formatClock, formatFileSize } from "../../lib/format-time";
import { AccessoryPlaceholder, AccessoryRow } from "../../ui/AccessoryRow";
import { IconButton } from "../../ui/IconButton";
import { FOCUS_RING } from "../../ui/styles/focus-ring";
import { DASHED_SLOT } from "../../ui/styles/surface-classes";
import { useElapsedSeconds } from "../../ui/use-elapsed-seconds";
import type { RecorderControls } from "./use-recorder";

interface FileAccessoriesProps {
  slots: readonly FileSlot[];
  files: Readonly<Record<string, File | null>>;
  recorder: RecorderControls;
  onChange: (field: string, file: File | null) => void;
}

interface SlotProps {
  slot: FileSlot;
  recorder: RecorderControls;
  onChange: (field: string, file: File | null) => void;
}

function iconFor(accept: string): LucideIcon {
  if (accept.startsWith("audio")) return FileAudio;
  if (accept.startsWith("image")) return FileImage;
  if (accept.startsWith("video")) return FileVideo;
  return FileIcon;
}

function ChosenFile({ slot, file, onChange }: Omit<SlotProps, "recorder"> & { file: File }) {
  const { strings } = useLocale();
  const Icon = iconFor(slot.accept);
  return (
    <AccessoryRow
      icon={<Icon aria-hidden className="size-4 shrink-0 text-accent" />}
      trailing={
        <IconButton size="sm" label={fillTemplate(strings.composer.removeFile, { name: file.name })} onClick={() => onChange(slot.field, null)}>
          <X aria-hidden className="size-3.5" />
        </IconButton>
      }
    >
      <span className="min-w-0 flex-1 truncate text-label font-semibold text-ink">{file.name}</span>
      <span className="shrink-0 text-caption text-ink-tertiary tabular-nums">{formatFileSize(file.size)}</span>
    </AccessoryRow>
  );
}

function RecordingClock({ startedAt, template }: { startedAt: number; template: string }) {
  return <>{fillTemplate(template, { time: formatClock(useElapsedSeconds(startedAt)) })}</>;
}

function RecordingRow({ recorder }: { recorder: RecorderControls }) {
  const { composer } = useLocale().strings;
  const isRecording = recorder.status === "recording";
  return (
    <AccessoryRow
      icon={<span aria-hidden className={classNames("size-2.5 shrink-0 rounded-full bg-danger", isRecording && "animate-pulse")} />}
      trailing={
        <IconButton size="sm" label={composer.stopRecording} disabled={!isRecording} onClick={() => void recorder.stop()}>
          <Square aria-hidden className="size-3 fill-current" />
        </IconButton>
      }
    >
      <span aria-live="polite" className="min-w-0 flex-1 truncate text-label font-semibold text-ink tabular-nums">
        {recorder.status === "recording" && <RecordingClock startedAt={recorder.startedAt} template={composer.recording} />}
        {recorder.status === "starting" && composer.preparingMicrophone}
        {recorder.status === "processing" && composer.processingRecording}
      </span>
    </AccessoryRow>
  );
}

function EmptySlot({ slot, recorder, onChange }: SlotProps) {
  const { strings, pick } = useLocale();
  const Icon = iconFor(slot.accept);
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onChange(slot.field, file);
  };
  const isRecorderBusy = recorder.status !== "idle";

  return (
    <div className="flex gap-2">
      <AccessoryPlaceholder
        icon={<Icon aria-hidden className="size-4 shrink-0 text-ink-secondary" />}
        label={pick(slot.label)}
        hint={pick(slot.hint)}
        input={<input type="file" data-file-slot={slot.field} accept={slot.accept} onChange={handleChange} className="sr-only" />}
      />
      {slot.canRecord && (
        <button
          type="button"
          aria-label={strings.composer.record}
          title={strings.composer.record}
          disabled={isRecorderBusy}
          onClick={() => void recorder.start(slot.field)}
          className={classNames(DASHED_SLOT, FOCUS_RING, "flex size-10 shrink-0 items-center justify-center text-ink-secondary disabled:opacity-40")}
        >
          <Mic aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}

function SlotView({ slot, file, recorder, onChange }: SlotProps & { file: File | null }) {
  const { strings } = useLocale();
  const error = recorder.error?.field === slot.field ? strings.recordingErrors[recorder.error.problem] : null;
  const isRecordingHere = recorder.field === slot.field && recorder.status !== "idle";
  return (
    <div className="flex flex-col gap-1.5">
      {isRecordingHere && <RecordingRow recorder={recorder} />}
      {!isRecordingHere && file && <ChosenFile slot={slot} file={file} onChange={onChange} />}
      {!isRecordingHere && !file && <EmptySlot slot={slot} recorder={recorder} onChange={onChange} />}
      {error && <p className="px-4 text-caption text-danger">{error}</p>}
    </div>
  );
}

export function FileAccessories({ slots, files, recorder, onChange }: FileAccessoriesProps) {
  if (slots.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-3 pt-3">
      {slots.map((slot) => (
        <SlotView key={slot.field} slot={slot} file={files[slot.field] ?? null} recorder={recorder} onChange={onChange} />
      ))}
    </div>
  );
}
