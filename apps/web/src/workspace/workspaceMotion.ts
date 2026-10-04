/**
 * Calm structural motion for the workspace (transitions.dev tokens). Panes
 * tween from where they were to where they are: a split grows its new pane out
 * of the divider, a close or zoom hands the space over, and a workspace switch
 * slides in. Every duration scales with the panel-animation setting
 * (250 ms = 1×), nothing loops, and motion is off at 0 ms or under reduced
 * motion. Divider drags never animate: they commit an unchanged layout.
 */
import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

import { usePanelAnimationSettings } from "../panelAnimations";
import { listPanes, type PaneId, type PaneNode, type PaneRect } from "./paneTree";
import { enteringRect } from "./workspaceView";
import { useWorkspaceStore } from "./workspaceStore";

/** --ease-smooth-out */
const EASE_SMOOTH_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
/** --duration-quick against --duration-fast: closes, resizes, focus fades. */
export const WORKSPACE_QUICK_RATIO = 0.6;
/** --blur-small for entering content; --blur-medium + --distance-base for workspace swaps. */
const ENTER_BLUR_PX = 2;
const SWAP_BLUR_PX = 3;
const SWAP_DISTANCE_PX = 8;

interface MotionSnapshot {
  readonly workspaceId: string;
  readonly workspaceIndex: number;
  readonly zoomedPaneId: PaneId | null;
  readonly narrow: boolean;
  readonly paneCount: number;
  readonly splitCount: number;
  readonly paneIds: ReadonlySet<PaneId>;
}

interface Measured {
  readonly container: DOMRect;
  readonly panes: ReadonlyMap<PaneId, DOMRect>;
}

function countSplits(node: PaneNode): number {
  return node.kind === "pane" ? 0 : 1 + countSplits(node.first) + countSplits(node.second);
}

function relative(rect: DOMRect, container: DOMRect): PaneRect {
  return {
    x: rect.left - container.left,
    y: rect.top - container.top,
    width: rect.width,
    height: rect.height,
  };
}

function frame(rect: PaneRect): Keyframe {
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

/** Cancels this module's script tweens on one element; CSS animations and transitions stay. */
function cancelOwnTweens(element: Element): void {
  for (const animation of element.getAnimations()) {
    if (animation instanceof CSSAnimation || animation instanceof CSSTransition) continue;
    animation.cancel();
  }
}

/**
 * Starts a tween after cancelling the element's previous one: a later action
 * (close right after a split) must not let an older, longer tween resurface
 * when the newer one ends. The start frames were measured mid-flight, so the
 * motion stays continuous.
 */
function restart(element: Element, keyframes: Keyframe[], timing: KeyframeAnimationOptions): void {
  cancelOwnTweens(element);
  element.animate(keyframes, timing);
}

function moved(a: PaneRect, b: PaneRect): boolean {
  return (
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) >= 1 ||
    Math.abs(a.height - b.height) >= 1
  );
}

export function useWorkspaceMotion(
  containerRef: RefObject<HTMLElement | null>,
  layout: {
    readonly workspaceId: string;
    readonly workspaceIndex: number;
    readonly zoomedPaneId: PaneId | null;
    readonly narrow: boolean;
    /** A divider drag is previewing ratios; those frames follow the pointer as they are. */
    readonly dragging: boolean;
    /** The visible tree, as rendered. */
    readonly root: PaneNode;
  },
): void {
  const { active, durationMs } = usePanelAnimationSettings();
  const activeRef = useRef(active);
  const previous = useRef<MotionSnapshot | null>(null);
  const before = useRef<Measured | null>(null);

  useLayoutEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Zustand notifies inside `set`, before React commits the next layout, so
  // this records where every pane sat just before a structural change.
  useEffect(
    () =>
      useWorkspaceStore.subscribe(() => {
        const container = containerRef.current;
        if (!container || !activeRef.current) return;
        const panes = new Map<PaneId, DOMRect>();
        for (const element of container.querySelectorAll<HTMLElement>("[data-pane-id]")) {
          panes.set(element.dataset.paneId!, element.getBoundingClientRect());
        }
        before.current = { container: container.getBoundingClientRect(), panes };
      }),
    [containerRef],
  );

  const { workspaceId, workspaceIndex, zoomedPaneId, narrow, dragging, root } = layout;
  useLayoutEffect(() => {
    const now: MotionSnapshot = {
      workspaceId,
      workspaceIndex,
      zoomedPaneId,
      narrow,
      paneCount: listPanes(root).length,
      splitCount: countSplits(root),
      paneIds: new Set(listPanes(root).map((pane) => pane.id)),
    };
    const prev = previous.current;
    const measured = before.current;
    previous.current = now;
    before.current = null;
    const container = containerRef.current;
    if (!prev || dragging || !activeRef.current || !container) return;

    if (prev.workspaceId !== now.workspaceId) {
      const direction = now.workspaceIndex >= prev.workspaceIndex ? 1 : -1;
      restart(
        container,
        [
          {
            opacity: 0,
            transform: `translateY(${SWAP_DISTANCE_PX * direction}px)`,
            filter: `blur(${SWAP_BLUR_PX}px)`,
          },
          { opacity: 1, transform: "none", filter: "blur(0px)" },
        ],
        { duration: durationMs, easing: EASE_SMOOTH_OUT },
      );
      return;
    }
    // Narrow mode swaps whole layouts on a window resize; nothing to tween.
    if (prev.narrow !== now.narrow || !measured) return;

    const zoomChanged = prev.zoomedPaneId !== now.zoomedPaneId;
    const unzoomed = zoomChanged && now.zoomedPaneId === null;
    const structural = zoomChanged || now.splitCount > prev.splitCount;
    const duration = structural ? durationMs : durationMs * WORKSPACE_QUICK_RATIO;
    const timing = { duration, easing: EASE_SMOOTH_OUT };
    // Settle in-flight tweens first so the end rects below are the real layout;
    // the start rects were measured mid-flight before the change.
    const paneElements = container.querySelectorAll<HTMLElement>("[data-pane-id]");
    for (const element of paneElements) {
      cancelOwnTweens(element);
      const content = element.querySelector("[data-pane-content]");
      if (content) cancelOwnTweens(content);
    }
    const containerRect = container.getBoundingClientRect();
    let animated = false;

    for (const element of paneElements) {
      const paneId = element.dataset.paneId!;
      const after = relative(element.getBoundingClientRect(), containerRect);
      const was = measured.panes.get(paneId);
      if (was && prev.paneIds.has(paneId)) {
        const from = relative(was, measured.container);
        if (!moved(from, after)) continue;
        restart(element, [frame(from), frame(after)], timing);
        animated = true;
        continue;
      }
      animated = true;
      if (unzoomed) {
        restart(element, [{ opacity: 0 }, { opacity: 1 }], timing);
        continue;
      }
      const unit = enteringRect(root, paneId);
      const from = {
        x: unit.x * containerRect.width,
        y: unit.y * containerRect.height,
        width: unit.width * containerRect.width,
        height: unit.height * containerRect.height,
      };
      restart(element, [frame(from), frame(after)], timing);
      const content = element.querySelector<HTMLElement>("[data-pane-content]");
      if (content) {
        restart(
          content,
          [
            { opacity: 0, filter: `blur(${ENTER_BLUR_PX}px)` },
            { opacity: 1, filter: "blur(0px)" },
          ],
          timing,
        );
      }
    }

    // Dividers jump to their final place; let them land after the panes do.
    if (!animated) return;
    for (const divider of container.querySelectorAll<HTMLElement>("[data-pane-divider]")) {
      restart(divider, [{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], timing);
    }
  }, [containerRef, dragging, durationMs, narrow, root, workspaceId, workspaceIndex, zoomedPaneId]);
}
