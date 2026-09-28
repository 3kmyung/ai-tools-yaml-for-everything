import { useRef, type HTMLAttributes } from "react";
import { classNames } from "../../lib/class-names";
import { useCanvasAnimation, type FramePainter } from "./use-canvas-animation";

interface DotCanvasProps extends HTMLAttributes<HTMLDivElement> {
  paint: FramePainter;
  isAnimated: boolean;
}

export function DotCanvas({ paint, isAnimated, className, ...wrapperProps }: DotCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasAnimation(canvasRef, paint, isAnimated);

  return (
    <div {...wrapperProps} className={classNames("relative w-full", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full text-ink" />
    </div>
  );
}
