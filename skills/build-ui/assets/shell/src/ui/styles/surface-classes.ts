import { classNames } from "../../lib/class-names";

export type SurfaceRadius = "panel" | "card";
export type SurfaceElevation = "none" | "float";

const RADIUS_CLASSES: Readonly<Record<SurfaceRadius, string>> = {
  panel: "rounded-panel",
  card: "rounded-card",
};

const ELEVATION_CLASSES: Readonly<Record<SurfaceElevation, string>> = {
  none: "",
  float: "shadow-float",
};

interface SurfaceShape {
  radius?: SurfaceRadius;
  elevation?: SurfaceElevation;
}

export function surfaceClasses({ radius = "card", elevation = "none" }: SurfaceShape): string {
  return classNames("border border-hairline bg-surface text-ink", RADIUS_CLASSES[radius], ELEVATION_CLASSES[elevation]);
}

export const DASHED_SLOT = "rounded-panel border border-dashed border-hairline hover:bg-surface-hover";

export const CARD_SECTION = "mt-4 border-t border-hairline pt-4";

export const TABLE_RULE = "divide-y divide-hairline";

export const FIELD_RULE = "border-b border-hairline";

export const SIDEBAR_EDGE = "border-r border-hairline bg-canvas";
