import { useCallback, useRef } from "react";
import { bandLevels, followEnvelope, voiceBinRange } from "../../audio/envelope";
import { connectAnalyser, resumePlaybackContext } from "../../audio/playback-analyser";

const BAND_COUNT = 8;

export interface PlaybackLevels {
  connect: () => void;
  readLevels: () => readonly number[];
}

function readSpectrum(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number[] {
  analyser.getByteFrequencyData(buffer);
  const range = voiceBinRange(analyser.context.sampleRate, analyser.frequencyBinCount);
  return bandLevels(buffer, range, BAND_COUNT);
}

export function usePlaybackLevels(element: HTMLAudioElement | null): PlaybackLevels {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(0));
  const levelsRef = useRef<number[]>(new Array<number>(BAND_COUNT).fill(0));

  const connect = useCallback(() => {
    if (!element) return;
    analyserRef.current = connectAnalyser(element);
    bufferRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
    void resumePlaybackContext();
  }, [element]);

  const readLevels = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return levelsRef.current;
    const targets = readSpectrum(analyser, bufferRef.current);
    levelsRef.current = levelsRef.current.map((level, band) => followEnvelope(level, targets[band] ?? 0));
    return levelsRef.current;
  }, []);

  return { connect, readLevels };
}
