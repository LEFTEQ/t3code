import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { createContext, use } from "react";

import { findPane, type PaneId, type PaneNode } from "./paneTree";

/**
 * The workspace's one right panel (D8-B). The focused pane's chat portals its
 * inspector into `slot`; every other pane renders none. `clampContainer` is
 * the row the inspector shares with the pane tree, so its width clamp leaves
 * the panes room. `sheet` replaces the viewport breakpoint with the row width.
 */
export interface WorkspaceInspectorValue {
  readonly slot: HTMLElement | null;
  readonly clampContainer: HTMLElement | null;
  readonly sheet: boolean;
  readonly setMaximized: (maximized: boolean) => void;
}

const WorkspaceInspectorContext = createContext<WorkspaceInspectorValue | null>(null);

export const WorkspaceInspectorProvider = WorkspaceInspectorContext.Provider;

/** Null outside a workspace host: the chat keeps its own inline inspector. */
export function useWorkspaceInspector(): WorkspaceInspectorValue | null {
  return use(WorkspaceInspectorContext);
}

/**
 * Thread keys of a pane's server tabs. A pane keeps persistent terminal
 * drawers only for these, and tabs are single-instance, so no two panes ever
 * host the same thread's terminal.
 */
export function paneServerThreadKeys(root: PaneNode, paneId: PaneId): string[] {
  const pane = findPane(root, paneId);
  if (!pane) return [];
  return pane.tabs.flatMap((tab) =>
    tab.kind === "server" ? [scopedThreadKey(tab.threadRef)] : [],
  );
}
