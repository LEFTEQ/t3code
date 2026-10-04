import { type CSSProperties } from "react";

import { cn } from "../lib/utils";
import { usePanelNavigationSuppression } from "../panelAnimations";
import { paneTabKey } from "./paneTree";
import { selectActiveWorkspace, selectFocusedTab, useWorkspaceStore } from "./workspaceStore";

const SUPPRESSED_STYLE = { "--panel-animation-duration": "0ms" } as CSSProperties;

/**
 * The slot right of the pane tree that holds the workspace's one inspector.
 * The focused pane's chat portals its right panel here, so the panel follows
 * focus. A focus move snaps to the next thread's panel state instead of
 * replaying its open transition, the same rule thread navigation follows.
 */
export function WorkspaceInspector({
  slotRef,
  maximized,
}: {
  readonly slotRef: (element: HTMLDivElement | null) => void;
  readonly maximized: boolean;
}) {
  const focusKey = useWorkspaceStore((state) => {
    const tab = selectFocusedTab(state);
    return `${selectActiveWorkspace(state).focusedPaneId}:${tab ? paneTabKey(tab) : ""}`;
  });
  const suppressed = usePanelNavigationSuppression(focusKey);
  return (
    <div
      ref={slotRef}
      data-workspace-inspector
      className={cn("flex min-h-0 min-w-0", maximized ? "flex-1" : "shrink-0")}
      style={suppressed ? SUPPRESSED_STYLE : undefined}
    />
  );
}
