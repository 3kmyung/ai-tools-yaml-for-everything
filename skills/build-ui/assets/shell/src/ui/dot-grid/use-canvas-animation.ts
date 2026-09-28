import { useEffect, useRef, type RefObject } from "react";
import type { CanvasSize } from "./draw-dot-grid";

export type FramePainter = (context: CanvasRenderingContext2D, size: CanvasSize, timeSeconds: number) => void;

function fitToDevicePixels(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, size: CanvasSize) {
  const ratio = window.devicePixelRatio || 1;
  size.width = canvas.clientWidth;
  size.height = canvas.clientHeight;
  canvas.width = Math.round(size.width * ratio);
  canvas.height = Math.round(size.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function observeSize(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, size: CanvasSize, render: () => void) {
  const observer = new ResizeObserver(() => {
    fitToDevicePixels(canvas, context, size);
    render();
  });
  observer.observe(canvas);
  return () => observer.disconnect();
}

function observeColorScheme(render: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", render);
  return () => query.removeEventListener("change", render);
}

function startLoop(render: (now: number) => void): () => void {
  let frame = 0;
  const tick = (now: number) => {
    render(now);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useCanvasAnimation(canvasRef: RefObject<HTMLCanvasElement | null>, paint: FramePainter, isAnimated: boolean) {
  const paintRef = useRef(paint);
  const redrawRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    paintRef.current = paint;
    if (!isAnimated) redrawRef.current?.();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const size: CanvasSize = { width: 0, height: 0 };
    const render = (now: number) => paintRef.current(context, size, now / 1000);
    redrawRef.current = () => render(performance.now());
    const stopObserving = observeSize(canvas, context, size, redrawRef.current);
    const stopWatchingScheme = observeColorScheme(redrawRef.current);
    const stopLoop = isAnimated && !prefersReducedMotion() ? startLoop(render) : undefined;
    return () => {
      stopObserving();
      stopWatchingScheme();
      stopLoop?.();
      redrawRef.current = null;
    };
  }, [canvasRef, isAnimated]);
}
