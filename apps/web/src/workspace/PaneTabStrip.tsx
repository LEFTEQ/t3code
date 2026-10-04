import { Columns2Icon, PlusIcon, Rows2Icon } from "lucide-react";

import { Button } from "../components/ui/button";
import { PanelTabCloseButton } from "../components/ui/panel-tab-close-button";
import { isElectron } from "../env";
import { cn } from "../lib/utils";
import { useThreadShell } from "../state/entities";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";
import { type PaneLeaf, type PaneTab, paneTabKey } from "./paneTree";
import { dispatchWorkspaceCommand } from "./useWorkspaceShortcuts";
import { useWorkspaceStore } from "./workspaceStore";
import type { PaneChrome } from "./workspaceView";

function usePaneTabTitle(tab: PaneTab): string {
  const shell = useThreadShell(tab.kind === "server" ? tab.threadRef : null);
  if (tab.kind === "draft") return "New thread";
  return shell?.title ?? "Thread";
}

function PaneTab({
  tab,
  selected,
  onSelect,
  onClose,
}: {
  readonly tab: PaneTab;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onClose: () => void;
}) {
  const title = usePaneTabTitle(tab);
  return (
    <div
      className={cn(
        "group/tab flex h-7 min-w-0 max-w-52 shrink items-center gap-1 rounded-md pr-1 pl-2 text-xs",
        selected
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        className="min-w-0 flex-1 cursor-pointer truncate text-left outline-none"
        onClick={onSelect}
      >
        {title}
      </button>
      <PanelTabCloseButton label={`Close ${title}`} onClick={onClose}>
        <span className="size-1.5 rounded-full bg-current opacity-40" />
      </PanelTabCloseButton>
    </div>
  );
}

/**
 * A pane's tabs plus its new-thread and split actions. Top-row strips double
 * as the window title bar, so they carry its drag region and corner insets.
 */
export function PaneTabStrip({
  pane,
  chrome,
}: {
  readonly pane: PaneLeaf;
  readonly chrome: PaneChrome;
}) {
  const focusThen = (command: Parameters<typeof dispatchWorkspaceCommand>[0]) => {
    useWorkspaceStore.getState().focusPane(pane.id);
    dispatchWorkspaceCommand(command);
  };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 border-b border-border bg-background px-1.5",
        chrome.top
          ? "h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)]"
          : "h-9",
        chrome.top && isElectron && "drag-region",
        chrome.topLeft && COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        chrome.topRight && "pr-(--workspace-gutter-end) wco:pr-(--workspace-native-controls-inset)",
      )}
    >
      <div
        role="tablist"
        aria-label="Pane tabs"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      >
        {pane.tabs.map((tab, index) => (
          <PaneTab
            key={paneTabKey(tab)}
            tab={tab}
            selected={index === pane.selectedIndex}
            onSelect={() => {
              const store = useWorkspaceStore.getState();
              store.focusPane(pane.id);
              store.selectTab(index);
            }}
            onClose={() => useWorkspaceStore.getState().closeTab(pane.id, index)}
          />
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="New thread"
        onClick={() => focusThen("tab.new")}
      >
        <PlusIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Split right"
        onClick={() => focusThen("workspace.splitRight")}
      >
        <Columns2Icon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Split down"
        onClick={() => focusThen("workspace.splitDown")}
      >
        <Rows2Icon />
      </Button>
      {/* The focused chat's panel controls sit fixed in the window's top-right corner. */}
      {chrome.topRight ? <span aria-hidden className="w-28 shrink-0" /> : null}
    </div>
  );
}
