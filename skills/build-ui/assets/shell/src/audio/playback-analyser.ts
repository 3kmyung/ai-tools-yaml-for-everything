const FFT_SIZE = 512;

let sharedContext: AudioContext | null = null;
const analysers = new WeakMap<HTMLAudioElement, AnalyserNode>();

function playbackContext(): AudioContext {
  sharedContext ??= new AudioContext();
  return sharedContext;
}

export function connectAnalyser(element: HTMLAudioElement): AnalyserNode {
  const known = analysers.get(element);
  if (known) return known;
  const context = playbackContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0.5;
  analyser.minDecibels = -85;
  analyser.maxDecibels = -25;
  context.createMediaElementSource(element).connect(analyser);
  analyser.connect(context.destination);
  analysers.set(element, analyser);
  return analyser;
}

export function resumePlaybackContext(): Promise<void> {
  return playbackContext().resume();
}
