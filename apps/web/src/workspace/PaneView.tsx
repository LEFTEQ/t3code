import { type SyntheticEvent, memo, useEffect, useMemo, useRef } from "react";

import { ThreadRouteView } from "../components/ThreadRouteView";
import { Button } from "../components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { PaneContextProvider, markDirectPaneFocus } from "./paneContext";
import { type PaneLeaf, type PaneRect, selectedTab } from "./paneTree";
import { PaneTabStrip } from "./PaneTabStrip";
import { dispatchWorkspaceCommand } from "./useWorkspaceShortcuts";
import { selectActiveWorkspace, useWorkspaceStore } from "./workspaceStore";
import { type PaneChrome, createPaneContextValue } from "./workspaceView";

function percent(value: number): string {
  return `${value * 100}%`;
}

function EmptyPane({ isFocused }: { readonly isFocused: boolean }) {
  // Focus moving here by keyboard must leave the previous pane's composer, or
  // typing would still land in a chat that is no longer focused.
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = buttonRef.current;
    if (!isFocused || !button) return;
    const pane = button.closest("[data-pane-id]");
    if (pane && !pane.contains(document.activeElement)) button.focus({ preventScroll: true });
  }, [isFocused]);
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyTitle>Empty pane</EmptyTitle>
        <EmptyDescription>Start a thread here, or open one from the sidebar.</EmptyDescription>
        <div className="mt-4 flex justify-center">
          <Button ref={buttonRef} size="sm" onClick={() => dispatchWorkspaceCommand("tab.new")}>
            New thread
          </Button>
        </div>
      </EmptyHeader>
    </Empty>
  );
}

/**
 * Everything inside a pane. Memoized apart from the pane's geometry so a
 * divider drag repositions panes without re-rendering their chats.
 */
const PaneBody = memo(function PaneBody({
  pane,
  top,
  topLeft,
  topRight,
  isFocused,
  showFocusRing,
}: PaneChrome & {
  readonly pane: PaneLeaf;
  readonly isFocused: boolean;
  readonly showFocusRing: boolean;
}) {
  const chrome = useMemo(() => ({ top, topLeft, topRight }), [top, topLeft, topRight]);
  const paneContext = useMemo(
    () => createPaneContextValue(pane.id, isFocused),
    [pane.id, isFocused],
  );
  const tab = selectedTab(pane);
  return (
    <div
      data-focus-ring={showFocusRing ? "true" : "false"}
      className="@container/pane relative flex min-h-0 min-w-0 flex-1 flex-col after:pointer-events-none after:absolute after:inset-0 after:z-20 after:opacity-0 after:ring-1 after:ring-primary/60 after:ring-inset after:transition-opacity after:duration-(--workspace-focus-duration) after:ease-out data-[focus-ring=true]:after:opacity-100"
    >
      <PaneTabStrip pane={pane} chrome={chrome} />
      <div data-pane-content className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <PaneContextProvider value={paneContext}>
          {tab ? (
            <ThreadRouteView
              target={tab}
              frame="pane"
              inspector="none"
              reserveTitleBarControlInset={false}
              titleBarDragRegion={false}
            />
          ) : (
            <EmptyPane isFocused={isFocused} />
          )}
        </PaneContextProvider>
      </div>
    </div>
  );
});

/**
 * One leaf of the workspace, absolutely placed from its unit-square rect.
 * Panes render flat and keyed by id, so splitting, closing or zooming never
 * remounts a chat that stays on screen.
 */
export const PaneView = memo(function PaneView({
  pane,
  rect,
  chrome,
  multiPane,
}: {
  readonly pane: PaneLeaf;
  readonly rect: PaneRect;
  readonly chrome: PaneChrome;
  readonly multiPane: boolean;
}) {
  const isFocused = useWorkspaceStore(
    (state) => selectActiveWorkspace(state).focusedPaneId === pane.id,
  );
  const focusPane = (event: SyntheticEvent) => {
    if (isFocused) return;
    if (event.target instanceof Element && event.target.closest("[data-pane-content]")) {
      markDirectPaneFocus(pane.id);
    }
    useWorkspaceStore.getState().focusPane(pane.id);
  };
  return (
    <section
      aria-label="Workspace pane"
      data-pane-id={pane.id}
      data-focused={isFocused ? "true" : "false"}
      className="absolute flex min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      style={{
        left: percent(rect.x),
        top: percent(rect.y),
        width: percent(rect.width),
        height: percent(rect.height),
      }}
      onPointerDownCapture={focusPane}
      onFocusCapture={focusPane}
    >
      <PaneBody
        pane={pane}
        top={chrome.top}
        topLeft={chrome.topLeft}
        topRight={chrome.topRight}
        isFocused={isFocused}
        showFocusRing={isFocused && multiPane}
      />
    </section>
  );
});
