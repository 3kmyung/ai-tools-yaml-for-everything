import type { FailureCopy, ShellFailureReason } from "../core/failure-copy";

export interface ShellStrings {
  language: {
    name: string;
    label: string;
  };
  sidebar: {
    open: string;
    close: string;
    newRun: string;
    history: string;
    emptyHistory: string;
    rename: string;
    delete: string;
    threadName: string;
  };
  recency: {
    today: string;
    lastWeek: string;
    older: string;
  };
  deleteSheet: {
    title: string;
    description: string;
    cancel: string;
    confirm: string;
  };
  composer: {
    workflowPicker: string;
    run: string;
    stopRun: string;
    stopping: string;
    removeFile: string;
    record: string;
    stopRecording: string;
    recording: string;
    preparingMicrophone: string;
    processingRecording: string;
    recordingBlocksRun: string;
  };
  recordingErrors: {
    insecureContext: string;
    permissionDenied: string;
    microphoneMissing: string;
    startFailed: string;
    conversionFailed: string;
  };
  thread: {
    running: string;
    stopping: string;
    steps: string;
    retry: string;
  };
  failures: Readonly<Record<ShellFailureReason, FailureCopy>>;
  result: {
    completedIn: string;
    seconds: string;
    saveJson: string;
  };
  audio: {
    play: string;
    pause: string;
    position: string;
    skipBack: string;
    skipForward: string;
    playbackRate: string;
    save: string;
  };
}
