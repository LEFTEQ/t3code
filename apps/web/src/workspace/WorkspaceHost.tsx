import { useNavigate } from "@tanstack/react-router";
import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { SidebarInset } from "../components/ui/sidebar";
import { usePanelAnimationSettings } from "../panelAnimations";
import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  type ThreadRouteTarget,
} from "../threadRoutes";
import { PaneContextProvider } from "./paneContext";
import { listPanes, paneRects, paneTabKey, setSplitRatio, type PaneTab } from "./paneTree";
import { PaneDividers } from "./PaneSplit";
import { PaneView } from "./PaneView";
import { type RouteSyncState, planRouteSync } from "./routeSync";
import { useWorkspaceShortcuts } from "./useWorkspaceShortcuts";
import { WORKSPACE_QUICK_RATIO, useWorkspaceMotion } from "./workspaceMotion";
import { selectActiveWorkspace, selectFocusedTab, useWorkspaceStore } from "./workspaceStore";
import {
  FOCUSED_PANE_CONTEXT,
  NARROW_WORKSPACE_WIDTH_PX,
  paneChrome,
  visibleLayout,
} from "./workspaceView";

// A leaf, so route and atom churn inside the dispatcher never re-renders the panes.
function WorkspaceShortcuts({
  containerRef,
}: {
  readonly containerRef: RefObject<HTMLElement | null>;
}) {
  useWorkspaceShortcuts(containerRef);
  return null;
}

/** Keeps the URL on the focused tab and opens whatever the router navigates to. */
function WorkspaceRouteSync({ routeTarget }: { readonly routeTarget: ThreadRouteTarget | null }) {
  const navigate = useNavigate();
  const focusedTab = useWorkspaceStore(selectFocusedTab);
  const synced = useRef<RouteSyncState | null>(null);

  const navigateTo = useEffectEvent((target: PaneTab | null) => {
    if (target === null) {
      void navigate({ to: "/", replace: true });
    } else if (target.kind === "server") {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(target.threadRef),
        replace: true,
      });
    } else {
      void navigate({
        to: "/draft/$draftId",
        params: buildDraftThreadRouteParams(target.draftId),
        replace: true,
      });
    }
  });

  const sync = useEffectEvent(() => {
    const { action, next } = planRouteSync(synced.current, routeTarget, focusedTab);
    synced.current = next;
    if (action.kind === "open") useWorkspaceStore.getState().openTarget(action.target);
    if (action.kind === "navigate") navigateTo(action.target);
  });

  const routeKey = routeTarget ? paneTabKey(routeTarget) : null;
  const focusedKey = focusedTab ? paneTabKey(focusedTab) : null;
  useEffect(() => {
    const last = synced.current;
    if (last && last.routeKey === routeKey && last.focusedKey === focusedKey) return;
    sync();
  }, [routeKey, focusedKey]);
  return null;
}

function useNarrowContainer(containerRef: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setNarrow(container.clientWidth < NARROW_WORKSPACE_WIDTH_PX);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);
  return narrow;
}

interface DragPreview {
  readonly splitId: string;
  readonly ratio: number;
}

/**
 * The split workspace in place of the single routed chat: the active
 * workspace's panes, laid out flat from the split tree, with one keyboard
 * dispatcher and the URL following the focused tab. Only the selected tab of
 * each visible pane mounts a chat.
 */
export function WorkspaceHost({ routeTarget }: { readonly routeTarget: ThreadRouteTarget | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspace = useWorkspaceStore(selectActiveWorkspace);
  const workspaceIndex = useWorkspaceStore((state) =>
    state.workspaces.findIndex((candidate) => candidate.id === state.activeWorkspaceId),
  );
  const narrow = useNarrowContainer(containerRef);
  const [drag, setDrag] = useState<DragPreview | null>(null);

  const shownRoot = visibleLayout(workspace, narrow);
  const root = useMemo(
    () => (drag ? setSplitRatio(shownRoot, drag.splitId, drag.ratio) : shownRoot),
    [drag, shownRoot],
  );
  const panes = useMemo(() => listPanes(root), [root]);
  const rects = useMemo(() => paneRects(root), [root]);
  const chrome = useMemo(() => paneChrome(root), [root]);

  useWorkspaceMotion(containerRef, {
    workspaceId: workspace.id,
    workspaceIndex,
    zoomedPaneId: workspace.zoomedPaneId,
    narrow,
    dragging: drag !== null,
    root,
  });
  const { active, durationMs } = usePanelAnimationSettings();
  const style = {
    "--workspace-focus-duration": `${active ? durationMs * WORKSPACE_QUICK_RATIO : 0}ms`,
  } as CSSProperties;

  const previewRatio = useCallback((splitId: string, ratio: number) => {
    setDrag({ splitId, ratio });
  }, []);
  const commitRatio = useCallback((splitId: string, ratio: number) => {
    useWorkspaceStore.getState().setRatio(splitId, ratio);
    setDrag(null);
  }, []);

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none md:h-dvh">
      <PaneContextProvider value={FOCUSED_PANE_CONTEXT}>
        <WorkspaceShortcuts containerRef={containerRef} />
      </PaneContextProvider>
      <WorkspaceRouteSync routeTarget={routeTarget} />
      <div
        ref={containerRef}
        data-workspace-id={workspace.id}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
        style={style}
      >
        {panes.map((pane) => (
          <PaneView
            key={pane.id}
            pane={pane}
            rect={rects.get(pane.id)!}
            chrome={chrome.get(pane.id)!}
            multiPane={panes.length > 1}
          />
        ))}
        <PaneDividers
          root={root}
          containerRef={containerRef}
          onPreview={previewRatio}
          onCommit={commitRatio}
        />
      </div>
    </SidebarInset>
  );
}
