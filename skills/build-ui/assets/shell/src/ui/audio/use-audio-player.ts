import { useCallback, useEffect, useState, type RefCallback } from "react";
import type { PlaybackFocus } from "../../core/release";
import { EMPTY_SNAPSHOT, subscribeToAudioElement, type AudioElementSnapshot } from "./audio-element-events";
import { usePlaybackLevels } from "./use-playback-levels";

const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.75] as const;

export interface AudioPlayer {
  audioRef: RefCallback<HTMLAudioElement>;
  source: string | null;
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  togglePlay: () => void;
  playFrom: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  skipBy: (seconds: number) => void;
  cycleRate: () => void;
  readLevels: () => readonly number[];
  readPosition: () => number;
}

interface AudioPlayerArguments {
  source: string | null;
  playback: PlaybackFocus;
  playerId: string;
}

function nextPlaybackRate(rate: number): number {
  const index = PLAYBACK_RATES.findIndex((value) => value === rate);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? 1;
}

function useElementState(element: HTMLAudioElement | null, onStart: () => void) {
  const [snapshot, setSnapshot] = useState<AudioElementSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    if (!element) return setSnapshot(EMPTY_SNAPSHOT);
    return subscribeToAudioElement(element, setSnapshot, onStart);
  }, [element, onStart]);

  const setCurrentTime = useCallback((currentTime: number) => setSnapshot((previous) => ({ ...previous, currentTime })), []);

  return { ...snapshot, setCurrentTime };
}

function usePauseWhenUnfocused(element: HTMLAudioElement | null, isFocused: boolean) {
  useEffect(() => {
    if (!isFocused) element?.pause();
  }, [element, isFocused]);
}

export function useAudioPlayer({ source, playback, playerId }: AudioPlayerArguments): AudioPlayer {
  const [element, setElement] = useState<HTMLAudioElement | null>(null);
  const [rate, setRate] = useState<number>(PLAYBACK_RATES[0]);
  const { onPlaybackStart } = playback;
  const claimPlayback = useCallback(() => onPlaybackStart(playerId), [onPlaybackStart, playerId]);
  const state = useElementState(element, claimPlayback);
  const { setCurrentTime } = state;
  const { connect, readLevels } = usePlaybackLevels(element);
  usePauseWhenUnfocused(element, playback.playingId === playerId);

  useEffect(() => {
    if (element) element.playbackRate = rate;
  }, [element, rate]);

  const readPosition = useCallback(() => element?.currentTime ?? 0, [element]);

  const togglePlay = useCallback(() => {
    if (!element) return;
    if (!element.paused) return element.pause();
    connect();
    void element.play();
  }, [connect, element]);

  const seekTo = useCallback((seconds: number) => {
    if (!element) return;
    const limit = Number.isFinite(element.duration) ? element.duration : seconds;
    element.currentTime = Math.min(Math.max(seconds, 0), limit);
    setCurrentTime(element.currentTime);
  }, [element, setCurrentTime]);

  const playFrom = useCallback((seconds: number) => {
    seekTo(seconds);
    if (!element || !element.paused) return;
    connect();
    void element.play();
  }, [connect, element, seekTo]);

  const skipBy = useCallback((seconds: number) => seekTo(readPosition() + seconds), [readPosition, seekTo]);

  const cycleRate = useCallback(() => setRate(nextPlaybackRate(rate)), [rate]);

  return {
    audioRef: setElement,
    source,
    isReady: source !== null && state.duration > 0,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    duration: state.duration,
    rate,
    togglePlay,
    playFrom,
    seekTo,
    skipBy,
    cycleRate,
    readLevels,
    readPosition,
  };
}
