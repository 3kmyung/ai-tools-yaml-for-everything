import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { startRecording, type RecordingSession } from "../../audio/recorder";
import { toMonoWav } from "../../audio/to-wav";
import type { ShellStrings } from "../../i18n/shell-strings";

export type RecorderStatus = "idle" | "starting" | "recording" | "processing";

export type RecordingProblem = keyof ShellStrings["recordingErrors"];

export interface RecorderError {
  field: string;
  problem: RecordingProblem;
}

export interface RecorderControls {
  field: string | null;
  status: RecorderStatus;
  level: number;
  startedAt: number;
  error: RecorderError | null;
  start: (field: string) => Promise<void>;
  stop: () => Promise<void>;
}

const MAX_RECORDING_SECONDS = 600;
const RECORDING_FILE_NAME = "recording.wav";

function classifyRecordingError(error: unknown): RecordingProblem {
  if (!window.isSecureContext) return "insecureContext";
  if (error instanceof DOMException && error.name === "NotAllowedError") return "permissionDenied";
  if (error instanceof DOMException && error.name === "NotFoundError") return "microphoneMissing";
  return "startFailed";
}

function useLevelLoop(sessionRef: RefObject<RecordingSession | null>, isRecording: boolean) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!isRecording) return setLevel(0);
    let frame = 0;
    const tick = () => {
      setLevel(sessionRef.current?.readLevel() ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isRecording, sessionRef]);
  return level;
}

function useRecordingCap(isRecording: boolean, stop: () => Promise<void>) {
  useEffect(() => {
    if (!isRecording) return;
    const timer = setTimeout(() => void stop(), MAX_RECORDING_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [isRecording, stop]);
}

function useRecorderState() {
  const [field, setField] = useState<string | null>(null);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<RecorderError | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const sessionRef = useRef<RecordingSession | null>(null);
  useEffect(() => () => sessionRef.current?.cancel(), []);
  return { field, setField, status, setStatus, error, setError, startedAt, setStartedAt, sessionRef };
}

type RecorderState = ReturnType<typeof useRecorderState>;

function useStartRecording({ setField, setStatus, setError, setStartedAt, sessionRef }: RecorderState) {
  return useCallback(async (field: string) => {
    setError(null);
    setField(field);
    setStatus("starting");
    try {
      sessionRef.current = await startRecording();
      setStartedAt(Date.now());
      setStatus("recording");
    } catch (caught) {
      setError({ field, problem: classifyRecordingError(caught) });
      setField(null);
      setStatus("idle");
    }
  }, [sessionRef, setError, setField, setStartedAt, setStatus]);
}

function useStopRecording({ field, setField, setStatus, setError, sessionRef }: RecorderState, onRecorded: (field: string, file: File) => void) {
  return useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !field) return;
    sessionRef.current = null;
    setStatus("processing");
    try {
      const wav = await toMonoWav(await session.stop());
      onRecorded(field, new File([wav], RECORDING_FILE_NAME, { type: wav.type }));
    } catch {
      setError({ field, problem: "conversionFailed" });
    } finally {
      setField(null);
      setStatus("idle");
    }
  }, [field, onRecorded, sessionRef, setError, setField, setStatus]);
}

export function useRecorder(onRecorded: (field: string, file: File) => void): RecorderControls {
  const state = useRecorderState();
  const level = useLevelLoop(state.sessionRef, state.status === "recording");
  const start = useStartRecording(state);
  const stop = useStopRecording(state, onRecorded);
  useRecordingCap(state.status === "recording", stop);
  return { field: state.field, status: state.status, level, startedAt: state.startedAt, error: state.error, start, stop };
}
