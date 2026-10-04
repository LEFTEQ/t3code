import { type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

import { cn } from "../lib/utils";
import { MIN_PANE_HEIGHT_PX, MIN_PANE_WIDTH_PX, type PaneNode } from "./paneTree";
import { PANE_RESIZE_STEP_PX } from "./useWorkspaceShortcuts";
import { type PaneDividerLayout, paneDividers } from "./workspaceView";

/** The smallest extent a subtree can shrink to along one axis. */
function minimumExtent(node: PaneNode, axis: "width" | "height"): number {
  if (node.kind === "pane") return axis === "width" ? MIN_PANE_WIDTH_PX : MIN_PANE_HEIGHT_PX;
  const first = minimumExtent(node.first, axis);
  const second = minimumExtent(node.second, axis);
  const alongAxis = (node.direction === "row") === (axis === "width");
  return alongAxis ? first + second : Math.max(first, second);
}

function percent(value: number): string {
  return `${value * 100}%`;
}

interface PaneDividersProps {
  readonly root: PaneNode;
  readonly containerRef: RefObject<HTMLElement | null>;
  /** Live ratio while dragging; the host renders it without touching the store. */
  readonly onPreview: (splitId: string, ratio: number) => void;
  readonly onCommit: (splitId: string, ratio: number) => void;
}

/**
 * The split dividers, drawn over the flat pane layout. Dragging tracks the
 * pointer exactly (no easing) and commits once on release; arrow keys move a
 * focused divider by the cmux resize step; double-click evens the split.
 */
export function PaneDividers({ root, containerRef, onPreview, onCommit }: PaneDividersProps) {
  return paneDividers(root).map((layout) => (
    <PaneDivider
      key={layout.split.id}
      layout={layout}
      containerRef={containerRef}
      onPreview={onPreview}
      onCommit={onCommit}
    />
  ));
}

function PaneDivider({
  layout,
  containerRef,
  onPreview,
  onCommit,
}: Omit<PaneDividersProps, "root"> & { readonly layout: PaneDividerLayout }) {
  const { split, bounds } = layout;
  const row = split.direction === "row";
  const axis = row ? "width" : "height";

  // The split's size in pixels and the ratio range its panes' minimums allow.
  const measure = () => {
    const container = containerRef.current?.getBoundingClientRect();
    if (!container) return null;
    const size = row ? container.width * bounds.width : container.height * bounds.height;
    const origin = row
      ? container.left + container.width * bounds.x
      : container.top + container.height * bounds.y;
    const min = minimumExtent(split.first, axis) / size;
    const max = 1 - minimumExtent(split.second, axis) / size;
    if (size <= 0 || min > max) return null;
    const clamp = (ratio: number) => Math.min(Math.max(ratio, min), max);
    return { size, origin, clamp };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const geometry = measure();
    if (!geometry) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let latest = split.ratio;
    const move = (moveEvent: globalThis.PointerEvent) => {
      const position = row ? moveEvent.clientX : moveEvent.clientY;
      latest = geometry.clamp((position - geometry.origin) / geometry.size);
      onPreview(split.id, latest);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      onCommit(split.id, latest);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const back = row ? "ArrowLeft" : "ArrowUp";
    const forward = row ? "ArrowRight" : "ArrowDown";
    if (event.key !== back && event.key !== forward) return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const geometry = measure();
    if (!geometry) return;
    event.preventDefault();
    const step = PANE_RESIZE_STEP_PX / geometry.size;
    onCommit(split.id, geometry.clamp(split.ratio + (event.key === forward ? step : -step)));
  };

  const position = row
    ? bounds.x + bounds.width * split.ratio
    : bounds.y + bounds.height * split.ratio;
  const style: CSSProperties = row
    ? { left: percent(position), top: percent(bounds.y), height: percent(bounds.height) }
    : { top: percent(position), left: percent(bounds.x), width: percent(bounds.width) };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={row ? "Resize panes horizontally" : "Resize panes vertically"}
      aria-orientation={row ? "vertical" : "horizontal"}
      aria-valuemin={5}
      aria-valuemax={95}
      aria-valuenow={Math.round(split.ratio * 100)}
      data-pane-divider
      className={cn(
        "group/divider absolute z-30 flex touch-none items-stretch justify-center outline-none [-webkit-app-region:no-drag]",
        row
          ? "w-2 -translate-x-1/2 cursor-col-resize flex-row"
          : "h-2 -translate-y-1/2 cursor-row-resize flex-col",
      )}
      style={style}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onCommit(split.id, 0.5)}
    >
      <span
        aria-hidden
        className={cn(
          "bg-border group-hover/divider:bg-primary/50 group-focus-visible/divider:bg-primary group-active/divider:bg-primary/70",
          row ? "w-px" : "h-px",
        )}
      />
    </div>
  );
}
