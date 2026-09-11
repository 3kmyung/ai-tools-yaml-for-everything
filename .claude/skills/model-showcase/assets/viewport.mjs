const VIEWPORT_FRAME_WIDTH = 24;
const VIEWPORT_FRAME_HEIGHT = 111;

export function screenInfoFlag(width, height) {
  const screenWidth = Number(width) + VIEWPORT_FRAME_WIDTH;
  const screenHeight = Number(height) + VIEWPORT_FRAME_HEIGHT;

  return `--screen-info={${screenWidth}x${screenHeight} devicePixelRatio=1}`;
}
