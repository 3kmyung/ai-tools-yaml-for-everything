import type { KeyboardEvent, MouseEvent } from "react";

const KEY_STEP_SECONDS = 5;

function arrowDirectionOf(key: string): -1 | 0 | 1 {
  if (key === "ArrowRight") return 1;
  if (key === "ArrowLeft") return -1;
  return 0;
}

export function createSeekHandlers(position: number, duration: number, onSeek: (seconds: number) => void) {
  const handleClick = (event: MouseEvent<Element>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onSeek(((event.clientX - bounds.left) / bounds.width) * duration);
  };
  const handleKeyDown = (event: KeyboardEvent<Element>) => {
    const direction = arrowDirectionOf(event.key);
    if (direction === 0) return;
    event.preventDefault();
    onSeek(position + direction * KEY_STEP_SECONDS);
  };
  return { handleClick, handleKeyDown };
}
