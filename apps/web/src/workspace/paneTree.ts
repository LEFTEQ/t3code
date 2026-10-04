/**
 * Pure split-tree model behind the workspace: a binary tree of splits whose
 * leaves are panes, each holding an ordered strip of thread tabs.
 *
 * Every operation returns a new tree and never touches React or storage, so
 * the store, the host and keyboard commands share one tested geometry.
 */
import { scopedThreadKey } from "@t3tools/client-runtime/environment";

import type { ThreadRouteTarget } from "../threadRoutes";

export type PaneId = string;
export type PaneTab = ThreadRouteTarget;

export interface PaneLeaf {
  readonly kind: "pane";
  readonly id: PaneId;
  readonly tabs: readonly PaneTab[];
  readonly selectedIndex: number;
}

/** `row` places its children side by side (split right), `column` stacks them (split down). */
export interface PaneSplit {
  readonly kind: "split";
  readonly id: string;
  readonly direction: "row" | "column";
  readonly ratio: number;
  readonly first: PaneNode;
  readonly second: PaneNode;
}

export type PaneNode = PaneLeaf | PaneSplit;
export type FocusDirection = "left" | "right" | "up" | "down";

export interface PaneRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const MIN_PANE_WIDTH_PX = 240;
export const MIN_PANE_HEIGHT_PX = 160;
const MIN_RATIO = 0.05;
const EPSILON = 1e-9;

export function paneTabKey(tab: PaneTab): string {
  return tab.kind === "server"
    ? `server:${scopedThreadKey(tab.threadRef)}`
    : `draft:${tab.draftId}`;
}

export function samePaneTab(a: PaneTab, b: PaneTab): boolean {
  return paneTabKey(a) === paneTabKey(b);
}

export function createPaneLeaf(id: PaneId, tabs: readonly PaneTab[] = []): PaneLeaf {
  return { kind: "pane", id, tabs, selectedIndex: 0 };
}

/** Leaves in reading order: first subtree before second. */
export function listPanes(node: PaneNode): PaneLeaf[] {
  return node.kind === "pane" ? [node] : [...listPanes(node.first), ...listPanes(node.second)];
}

export function findPane(node: PaneNode, paneId: PaneId): PaneLeaf | null {
  return listPanes(node).find((pane) => pane.id === paneId) ?? null;
}

export function findTabLocation(
  node: PaneNode,
  tab: PaneTab,
): { paneId: PaneId; index: number } | null {
  const key = paneTabKey(tab);
  for (const pane of listPanes(node)) {
    const index = pane.tabs.findIndex((candidate) => paneTabKey(candidate) === key);
    if (index !== -1) return { paneId: pane.id, index };
  }
  return null;
}

export function selectedTab(pane: PaneLeaf): PaneTab | null {
  return pane.tabs[pane.selectedIndex] ?? null;
}

function mapPane(node: PaneNode, paneId: PaneId, update: (pane: PaneLeaf) => PaneNode): PaneNode {
  if (node.kind === "pane") return node.id === paneId ? update(node) : node;
  const first = mapPane(node.first, paneId, update);
  const second = mapPane(node.second, paneId, update);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

function clampIndex(index: number, length: number): number {
  return length === 0 ? 0 : Math.min(Math.max(index, 0), length - 1);
}

/** Replaces the pane with a split holding it first and a new pane second. */
export function splitPane(
  node: PaneNode,
  paneId: PaneId,
  direction: "right" | "down",
  ids: { splitId: string; paneId: PaneId },
  tab?: PaneTab,
): PaneNode {
  return mapPane(node, paneId, (pane) => ({
    kind: "split",
    id: ids.splitId,
    direction: direction === "right" ? "row" : "column",
    ratio: 0.5,
    first: pane,
    second: createPaneLeaf(ids.paneId, tab ? [tab] : []),
  }));
}

/** Appends and selects the tab, or selects it when the pane already holds it. */
export function addTab(node: PaneNode, paneId: PaneId, tab: PaneTab): PaneNode {
  return mapPane(node, paneId, (pane) => {
    const existing = pane.tabs.findIndex((candidate) => samePaneTab(candidate, tab));
    if (existing !== -1) return { ...pane, selectedIndex: existing };
    return { ...pane, tabs: [...pane.tabs, tab], selectedIndex: pane.tabs.length };
  });
}

export function selectTabAt(node: PaneNode, paneId: PaneId, index: number): PaneNode {
  return mapPane(node, paneId, (pane) =>
    index >= 0 && index < pane.tabs.length ? { ...pane, selectedIndex: index } : pane,
  );
}

/** Swaps one tab for another in place, keeping its position and selection. */
export function replaceTab(node: PaneNode, paneId: PaneId, from: PaneTab, to: PaneTab): PaneNode {
  return mapPane(node, paneId, (pane) => {
    const index = pane.tabs.findIndex((candidate) => samePaneTab(candidate, from));
    if (index === -1) return pane;
    const duplicate = pane.tabs.findIndex((candidate) => samePaneTab(candidate, to));
    if (duplicate !== -1 && duplicate !== index) {
      const tabs = pane.tabs.filter((_, position) => position !== index);
      return {
        ...pane,
        tabs,
        selectedIndex: clampIndex(tabs.indexOf(pane.tabs[duplicate]!), tabs.length),
      };
    }
    const tabs = pane.tabs.map((candidate, position) => (position === index ? to : candidate));
    return { ...pane, tabs };
  });
}

/**
 * Removes a whole pane, handing its space to its sibling. Returns the leaf
 * nearest to where the pane was, or null when the pane is the root.
 */
export function collapsePane(
  node: PaneNode,
  paneId: PaneId,
): { root: PaneNode; nearestPaneId: PaneId } | null {
  if (node.kind === "pane") return null;
  const collapse = (current: PaneSplit): { root: PaneNode; nearestPaneId: PaneId } | null => {
    if (current.first.kind === "pane" && current.first.id === paneId) {
      return { root: current.second, nearestPaneId: listPanes(current.second)[0]!.id };
    }
    if (current.second.kind === "pane" && current.second.id === paneId) {
      return { root: current.first, nearestPaneId: listPanes(current.first).at(-1)!.id };
    }
    if (current.first.kind === "split") {
      const result = collapse(current.first);
      if (result)
        return { root: { ...current, first: result.root }, nearestPaneId: result.nearestPaneId };
    }
    if (current.second.kind === "split") {
      const result = collapse(current.second);
      if (result)
        return { root: { ...current, second: result.root }, nearestPaneId: result.nearestPaneId };
    }
    return null;
  };
  return collapse(node);
}

/**
 * Removes one tab. A pane left without tabs collapses into its sibling unless
 * it is the only pane, which stays empty and shows the new-thread state.
 */
export function removeTab(
  node: PaneNode,
  paneId: PaneId,
  index: number,
): { root: PaneNode; removed: PaneTab | null; collapsedInto: PaneId | null } {
  const pane = findPane(node, paneId);
  const removed = pane?.tabs[index] ?? null;
  if (!pane || !removed) return { root: node, removed: null, collapsedInto: null };
  if (pane.tabs.length === 1) {
    const collapsed = collapsePane(node, paneId);
    if (collapsed) return { root: collapsed.root, removed, collapsedInto: collapsed.nearestPaneId };
  }
  const root = mapPane(node, paneId, (current) => {
    const tabs = current.tabs.filter((_, position) => position !== index);
    const selectedIndex =
      index < current.selectedIndex ? current.selectedIndex - 1 : current.selectedIndex;
    return { ...current, tabs, selectedIndex: clampIndex(selectedIndex, tabs.length) };
  });
  return { root, removed, collapsedInto: null };
}

/** Moves one tab into another pane, selecting it there; an emptied source pane collapses. */
export function moveTab(
  node: PaneNode,
  fromPaneId: PaneId,
  index: number,
  toPaneId: PaneId,
): PaneNode {
  if (fromPaneId === toPaneId || !findPane(node, toPaneId)) return node;
  const { root, removed } = removeTab(node, fromPaneId, index);
  return removed ? addTab(root, toPaneId, removed) : node;
}

/** Moves a pane's selected tab one slot left or right, keeping it selected. */
export function reorderTab(node: PaneNode, paneId: PaneId, delta: -1 | 1): PaneNode {
  return mapPane(node, paneId, (pane) => {
    const from = pane.selectedIndex;
    const to = from + delta;
    if (to < 0 || to >= pane.tabs.length) return pane;
    const tabs = [...pane.tabs];
    [tabs[from], tabs[to]] = [tabs[to]!, tabs[from]!];
    return { ...pane, tabs, selectedIndex: to };
  });
}

export function equalize(node: PaneNode): PaneNode {
  if (node.kind === "pane") return node;
  return { ...node, ratio: 0.5, first: equalize(node.first), second: equalize(node.second) };
}

export function setSplitRatio(node: PaneNode, splitId: string, ratio: number): PaneNode {
  if (node.kind === "pane") return node;
  if (node.id === splitId) {
    return { ...node, ratio: Math.min(Math.max(ratio, MIN_RATIO), 1 - MIN_RATIO) };
  }
  const first = setSplitRatio(node.first, splitId, ratio);
  const second = setSplitRatio(node.second, splitId, ratio);
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

/** Pane rectangles inside `bounds` (the unit square by default), from the split ratios. */
export function paneRects(
  node: PaneNode,
  bounds: PaneRect = { x: 0, y: 0, width: 1, height: 1 },
): Map<PaneId, PaneRect> {
  if (node.kind === "pane") return new Map([[node.id, bounds]]);
  const [firstBounds, secondBounds] = splitBounds(node, bounds);
  return new Map([...paneRects(node.first, firstBounds), ...paneRects(node.second, secondBounds)]);
}

function splitBounds(split: PaneSplit, bounds: PaneRect): [PaneRect, PaneRect] {
  if (split.direction === "row") {
    const width = bounds.width * split.ratio;
    return [
      { ...bounds, width },
      { ...bounds, x: bounds.x + width, width: bounds.width - width },
    ];
  }
  const height = bounds.height * split.ratio;
  return [
    { ...bounds, height },
    { ...bounds, y: bounds.y + height, height: bounds.height - height },
  ];
}

/**
 * The pane across the edge in `direction`, preferring the longest shared edge
 * and then the closest centre. Null at the outer edge.
 */
export function neighbourPane(
  node: PaneNode,
  paneId: PaneId,
  direction: FocusDirection,
): PaneId | null {
  const rects = paneRects(node);
  const source = rects.get(paneId);
  if (!source) return null;
  const horizontal = direction === "left" || direction === "right";
  let best: { id: PaneId; overlap: number; distance: number } | null = null;
  for (const [id, rect] of rects) {
    if (id === paneId) continue;
    const touches =
      direction === "right"
        ? Math.abs(rect.x - (source.x + source.width)) < EPSILON
        : direction === "left"
          ? Math.abs(rect.x + rect.width - source.x) < EPSILON
          : direction === "down"
            ? Math.abs(rect.y - (source.y + source.height)) < EPSILON
            : Math.abs(rect.y + rect.height - source.y) < EPSILON;
    if (!touches) continue;
    const overlap = horizontal
      ? Math.min(source.y + source.height, rect.y + rect.height) - Math.max(source.y, rect.y)
      : Math.min(source.x + source.width, rect.x + rect.width) - Math.max(source.x, rect.x);
    if (overlap <= EPSILON) continue;
    const distance = horizontal
      ? Math.abs(rect.y + rect.height / 2 - (source.y + source.height / 2))
      : Math.abs(rect.x + rect.width / 2 - (source.x + source.width / 2));
    if (
      !best ||
      overlap > best.overlap + EPSILON ||
      (Math.abs(overlap - best.overlap) <= EPSILON && distance < best.distance)
    ) {
      best = { id, overlap, distance };
    }
  }
  return best?.id ?? null;
}

/** The previous or next pane in reading order, without wrapping. */
export function adjacentPaneInOrder(node: PaneNode, paneId: PaneId, delta: -1 | 1): PaneId | null {
  const panes = listPanes(node);
  const index = panes.findIndex((pane) => pane.id === paneId);
  return index === -1 ? null : (panes[index + delta]?.id ?? null);
}

function minimumSize(node: PaneNode, axis: "width" | "height"): number {
  const minimum = axis === "width" ? MIN_PANE_WIDTH_PX : MIN_PANE_HEIGHT_PX;
  if (node.kind === "pane") return minimum;
  const first = minimumSize(node.first, axis);
  const second = minimumSize(node.second, axis);
  const alongAxis = (node.direction === "row") === (axis === "width");
  return alongAxis ? first + second : Math.max(first, second);
}

/**
 * Grows a pane toward `direction` by moving the nearest divider on that side
 * `stepPx` pixels. No pane shrinks below 240px wide or 160px tall; a pane with
 * no divider on that side is left as is.
 */
export function resizePane(
  node: PaneNode,
  paneId: PaneId,
  direction: FocusDirection,
  stepPx: number,
  container: { width: number; height: number },
): PaneNode {
  const splitDirection = direction === "left" || direction === "right" ? "row" : "column";
  const paneOnFirstSide = direction === "right" || direction === "down";
  const axis = splitDirection === "row" ? "width" : "height";

  // Walk down to the pane, remembering the deepest split whose divider sits on the wanted side.
  let target: { split: PaneSplit; bounds: PaneRect } | null = null;
  let current: PaneNode = node;
  let bounds: PaneRect = { x: 0, y: 0, width: container.width, height: container.height };
  while (current.kind === "split") {
    const inFirst = findPane(current.first, paneId) !== null;
    if (!inFirst && !findPane(current.second, paneId)) return node;
    if (current.direction === splitDirection && inFirst === paneOnFirstSide) {
      target = { split: current, bounds };
    }
    const [firstBounds, secondBounds] = splitBounds(current, bounds);
    bounds = inFirst ? firstBounds : secondBounds;
    current = inFirst ? current.first : current.second;
  }
  if (!target) return node;

  const size = target.bounds[axis];
  const minRatio = minimumSize(target.split.first, axis) / size;
  const maxRatio = 1 - minimumSize(target.split.second, axis) / size;
  if (minRatio > maxRatio) return node;
  const delta = (paneOnFirstSide ? stepPx : -stepPx) / size;
  const ratio = Math.min(Math.max(target.split.ratio + delta, minRatio), maxRatio);
  return setSplitRatio(node, target.split.id, ratio);
}
