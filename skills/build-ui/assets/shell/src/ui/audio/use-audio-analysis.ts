import { useEffect, useState } from "react";
import { analyzeAudio, type AudioAnalysis } from "../../audio/analyze";

export type AnalysisState = { status: "idle" } | { status: "ready"; analysis: AudioAnalysis } | { status: "failed" };

export function useAudioAnalysis(blob: Blob | null): AnalysisState {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });

  useEffect(() => {
    let isCurrent = true;
    setState({ status: "idle" });
    if (!blob) return;
    analyzeAudio(blob).then(
      (analysis) => {
        if (isCurrent) setState({ status: "ready", analysis });
      },
      () => {
        if (isCurrent) setState({ status: "failed" });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [blob]);

  return state;
}
