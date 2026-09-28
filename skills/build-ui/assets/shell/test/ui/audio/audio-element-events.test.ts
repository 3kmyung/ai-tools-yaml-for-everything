import { describe, expect, it } from "vitest";
import { readSnapshot, subscribeToAudioElement, type AudioElementSnapshot } from "../../../src/ui/audio/audio-element-events";

class FakeAudioElement extends EventTarget {
  paused = true;
  currentTime = 0;
  duration = Number.NaN;
}

function subscribe(element: FakeAudioElement) {
  const snapshots: AudioElementSnapshot[] = [];
  let starts = 0;
  const unsubscribe = subscribeToAudioElement(element, (snapshot) => snapshots.push(snapshot), () => {
    starts += 1;
  });
  return { snapshots, unsubscribe, startCount: () => starts };
}

describe("subscribeToAudioElement", () => {
  it("reads the element as soon as it is attached, however late that is", () => {
    const element = new FakeAudioElement();
    element.currentTime = 1.5;
    element.duration = 7.3;
    const { snapshots } = subscribe(element);
    expect(snapshots).toEqual([{ isPlaying: false, currentTime: 1.5, duration: 7.3 }]);
  });

  it("follows playback events and claims playback on play", () => {
    const element = new FakeAudioElement();
    const { snapshots, startCount } = subscribe(element);
    element.duration = 4;
    element.dispatchEvent(new Event("loadedmetadata"));
    element.paused = false;
    element.dispatchEvent(new Event("play"));
    element.currentTime = 2;
    element.dispatchEvent(new Event("timeupdate"));
    expect(startCount()).toBe(1);
    expect(snapshots.at(-1)).toEqual({ isPlaying: true, currentTime: 2, duration: 4 });
  });

  it("stops listening once unsubscribed", () => {
    const element = new FakeAudioElement();
    const { snapshots, unsubscribe, startCount } = subscribe(element);
    unsubscribe();
    element.dispatchEvent(new Event("play"));
    element.dispatchEvent(new Event("timeupdate"));
    expect(snapshots).toHaveLength(1);
    expect(startCount()).toBe(0);
  });

  it("treats an unknown duration as zero", () => {
    expect(readSnapshot(new FakeAudioElement()).duration).toBe(0);
  });
});
