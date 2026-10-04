/**
 * What the workspace host renders and how each pane talks back to the store.
 * Kept out of the components so the visibility and focus rules are testable.
 */
import type { PaneContextValue } from "./paneContext";
import {
  findPane,
  findTabLocation,
  paneRects,
  paneTabKey,
  selectedTab,
  type PaneId,
  type PaneLeaf,
  type PaneNode,
  type PaneRect,
  type PaneSplit,
  type PaneTab,
} from "./paneTree";
import { type Workspace, selectActiveWorkspace, useWorkspaceStore } from "./workspaceStore";

/** Below this pane-tree width only the focused pane shows; the saved layout is kept. */
export const NARROW_WORKSPACE_WIDTH_PX = 720;

/**
 * The part of the tree on screen: the zoomed pane, the focused pane when the
 * window is narrow, otherwise the whole tree. The focused pane is always in it.
 */
export function visibleLayout(workspace: Workspace, narrow: boolean): PaneNode {
  const zoomed =
    workspace.zoomedPaneId !== null && workspace.zoomedPaneId === workspace.focusedPaneId;
  if (!zoomed && !narrow) return workspace.root;
  return findPane(workspace.root, workspace.focusedPaneId) ?? workspace.root;
}

/**
 * Whether the index route should keep showing the workspace: a split or any
 * open tab is a layout worth keeping; a lone empty pane lets the index land a
 * fresh draft as it does without panes.
 */
export function hasWorkspaceLayout(workspace: Workspace): boolean {
  return workspace.root.kind === "split" || workspace.root.tabs.length > 0;
}

export interface PaneChrome {
  /** Touches the window's top edge: its tab strip is part of the title bar. */
  readonly top: boolean;
  /** The top-left corner: clears the traffic lights when the sidebar is collapsed. */
  readonly topLeft: boolean;
  /** The top-right corner: clears the panel controls and native window controls. */
  readonly topRight: boolean;
}

export function paneChrome(root: PaneNode): ReadonlyMap<PaneId, PaneChrome> {
  const chrome = new Map<PaneId, PaneChrome>();
  for (const [paneId, rect] of paneRects(root)) {
    const top = rect.y < 1e-6;
    chrome.set(paneId, {
      top,
      topLeft: top && rect.x < 1e-6,
      topRight: top && rect.x + rect.width > 1 - 1e-6,
    });
  }
  return chrome;
}

export interface PaneDividerLayout {
  readonly split: PaneSplit;
  /** The whole split's area, in the unit square. */
  readonly bounds: PaneRect;
}

function childBounds(split: PaneSplit, bounds: PaneRect): [PaneRect, PaneRect] {
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

const UNIT: PaneRect = { x: 0, y: 0, width: 1, height: 1 };

/** One divider per split, in the unit square; panes are laid out flat beside them. */
export function paneDividers(root: PaneNode, bounds: PaneRect = UNIT): PaneDividerLayout[] {
  if (root.kind === "pane") return [];
  const [first, second] = childBounds(root, bounds);
  return [
    { split: root, bounds },
    ...paneDividers(root.first, first),
    ...paneDividers(root.second, second),
  ];
}

/**
 * Where a newly split pane grows from: its final rect collapsed onto the edge
 * it shares with its sibling's far side, so it opens out of the divider.
 */
export function enteringRect(root: PaneNode, paneId: PaneId, bounds: PaneRect = UNIT): PaneRect {
  if (root.kind === "pane") return bounds;
  const [first, second] = childBounds(root, bounds);
  const inFirst = findPane(root.first, paneId) !== null;
  const child = inFirst ? root.first : root.second;
  if (child.kind === "pane" && child.id === paneId) {
    const rect = inFirst ? first : second;
    if (root.direction === "row") {
      return { ...rect, x: inFirst ? rect.x : rect.x + rect.width, width: 0 };
    }
    return { ...rect, y: inFirst ? rect.y : rect.y + rect.height, height: 0 };
  }
  return enteringRect(child, paneId, inFirst ? first : second);
}

function findPaneAnywhere(paneId: PaneId): PaneLeaf | null {
  for (const workspace of useWorkspaceStore.getState().workspaces) {
    const pane = findPane(workspace.root, paneId);
    if (pane) return pane;
  }
  return null;
}

function isOpenAnywhere(tab: PaneTab): boolean {
  return useWorkspaceStore
    .getState()
    .workspaces.some((workspace) => findTabLocation(workspace.root, tab) !== null);
}

function indexInPane(pane: PaneLeaf, tab: PaneTab): number {
  const key = paneTabKey(tab);
  return pane.tabs.findIndex((candidate) => paneTabKey(candidate) === key);
}

/**
 * The pane context a workspace pane hands its chat: targets open, swap and
 * close inside this pane, and every call is a no-op once the pane or the tab
 * is gone, so late async results (promotion, redirects) cannot misfire.
 */
export function createPaneContextValue(paneId: PaneId, isFocused: boolean): PaneContextValue {
  const readTarget = () => {
    const pane = findPaneAnywhere(paneId);
    return pane ? selectedTab(pane) : null;
  };
  return {
    paneId,
    isFocused,
    readTarget,
    readLocationKey: () => {
      if (!findPaneAnywhere(paneId)) return `${paneId}:closed`;
      const target = readTarget();
      return `${paneId}:${target ? paneTabKey(target) : "empty"}`;
    },
    openTarget: (target, options) => {
      const pane = findPaneAnywhere(paneId);
      if (!pane) return;
      const store = useWorkspaceStore.getState();
      store.focusPane(paneId);
      const current = selectedTab(pane);
      if (options?.replace && current && !isOpenAnywhere(target)) {
        store.replaceTab(paneId, current, target);
        return;
      }
      store.openTarget(target);
    },
    replaceTarget: (from, to) => {
      const pane = findPaneAnywhere(paneId);
      if (!pane || indexInPane(pane, from) === -1) return;
      const store = useWorkspaceStore.getState();
      // Already open elsewhere: drop this copy and show the other one.
      if (isOpenAnywhere(to) && indexInPane(pane, to) === -1) {
        store.dismissTab(paneId, indexInPane(pane, from));
        store.openTarget(to);
        return;
      }
      store.replaceTab(paneId, from, to);
    },
    dismissTarget: (target) => {
      const pane = findPaneAnywhere(paneId);
      const index = pane ? indexInPane(pane, target) : -1;
      if (index !== -1) useWorkspaceStore.getState().dismissTab(paneId, index);
    },
  };
}

function focusedPaneContext(): PaneContextValue {
  const { focusedPaneId } = selectActiveWorkspace(useWorkspaceStore.getState());
  return createPaneContextValue(focusedPaneId, true);
}

/**
 * The pane context for workspace-level callers outside any pane (the shortcut
 * dispatcher): it follows whichever pane is focused at call time, so a request
 * made right after a focus change never reads the route the URL is still
 * catching up from.
 */
export const FOCUSED_PANE_CONTEXT: PaneContextValue = {
  paneId: null,
  isFocused: true,
  readTarget: () => focusedPaneContext().readTarget(),
  readLocationKey: () => focusedPaneContext().readLocationKey(),
  openTarget: (target, options) => focusedPaneContext().openTarget(target, options),
  replaceTarget: (from, to) => focusedPaneContext().replaceTarget(from, to),
  dismissTarget: (target) => focusedPaneContext().dismissTarget(target),
};
