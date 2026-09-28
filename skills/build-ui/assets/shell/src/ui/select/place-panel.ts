export interface AnchorBox {
  top: number;
  bottom: number;
  left: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface PanelPlacement {
  top: number;
  left: number;
  maxHeight: number;
}

const GAP = 6;
const EDGE_MARGIN = 16;

export function placePanel(anchor: AnchorBox, panel: Size, viewport: Size): PanelPlacement {
  const roomBelow = viewport.height - anchor.bottom - GAP - EDGE_MARGIN;
  const roomAbove = anchor.top - GAP - EDGE_MARGIN;
  const opensBelow = panel.height <= roomBelow || roomBelow >= roomAbove;
  const maxHeight = Math.max(0, opensBelow ? roomBelow : roomAbove);
  const top = opensBelow ? anchor.bottom + GAP : anchor.top - GAP - Math.min(panel.height, maxHeight);
  const left = Math.max(EDGE_MARGIN, Math.min(anchor.left, viewport.width - EDGE_MARGIN - panel.width));
  return { top, left, maxHeight };
}
