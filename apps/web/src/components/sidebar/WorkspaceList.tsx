/**
 * The sidebar as cmux shows it: one row per workspace with a line per tab and
 * the threads' pull requests. "All threads" swaps in the classic thread list;
 * the choice is kept per device.
 */
import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { WORKSPACE_SELECT_KEYBINDING_COMMANDS } from "@t3tools/contracts";
import {
  resolveThreadCurrentPullRequestLink,
  resolveThreadPullRequestBadge,
} from "@t3tools/shared/threadPullRequests";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleIcon,
  Columns2Icon,
  EyeIcon,
  ListIcon,
  MessageCircleQuestionIcon,
  PlusIcon,
  ShieldQuestionIcon,
  SquarePenIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { isElectron } from "../../env";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { isWorkspaceShortcutsActive, shortcutLabelForCommand } from "../../keybindings";
import { useOpenPrLink } from "../../lib/openPullRequestLink";
import { cn, isMacPlatform } from "../../lib/utils";
import { useRightPanelStore } from "../../rightPanelStore";
import { useShortcutModifierState } from "../../shortcutModifierState";
import { useThreadShells } from "../../state/entities";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "../../threadRoutes";
import type { SidebarThreadSummary } from "../../types";
import { useUiStateStore } from "../../uiStateStore";
import { type TabAttention, shellMapFor, tabAttention } from "../../workspace/attention";
import { listPanes, paneTabKey, type PaneTab } from "../../workspace/paneTree";
import {
  closeWorkspaceWithUndo,
  dispatchWorkspaceCommand,
  onWorkspaceUiCommand,
} from "../../workspace/useWorkspaceShortcuts";
import {
  type Workspace,
  selectFocusedTab,
  useWorkspaceStore,
} from "../../workspace/workspaceStore";
import { useThreadJumpHintVisibility } from "../Sidebar.logic";
import {
  linkedPullRequestSnapshotStatus,
  prStatusIndicator,
  ThreadPullRequestBadgeControl,
} from "../ThreadStatusIndicators";
import { InlineButton } from "../ui/button";
import { SidebarContent, SidebarGroup } from "../ui/sidebar";
import { SidebarChromeFooter, SidebarChromeHeader } from "./SidebarChrome";
import { SidebarHeaderIconButton } from "./SidebarThreadHeader";

const WORKSPACE_SIDEBAR_MODE_KEY = "t3code:sidebar:workspace-mode";
const WorkspaceSidebarMode = Schema.Literals(["workspaces", "threads"]);

/** Which list the sidebar shows while the split workspace is available; kept per device. */
export function useWorkspaceSidebarMode() {
  return useLocalStorage(WORKSPACE_SIDEBAR_MODE_KEY, "workspaces", WorkspaceSidebarMode);
}

let mountedWorkspaceLists = 0;
let workspaceRenameRequested = false;

/**
 * Asks for an inline rename of the active workspace. A mounted list handles
 * "workspace.rename" itself; a hidden one (All threads) starts the rename when
 * it next mounts.
 */
export function requestWorkspaceRename(): void {
  if (mountedWorkspaceLists === 0) workspaceRenameRequested = true;
}

type ShellByKey = ReadonlyMap<string, SidebarThreadSummary>;

// The sidebar's system-wide hues (amber approval, indigo input, sky working)
// under cmux's words, so a thread reads the same color everywhere it shows.
function tabStatus(tab: PaneTab, attention: TabAttention | null) {
  if (tab.kind === "draft") return { label: "Draft", Icon: SquarePenIcon, className: "" };
  switch (attention?.status) {
    case "working":
      return { label: "Running", Icon: ZapIcon, className: "text-sky-600 dark:text-sky-400" };
    case "monitoring":
      return { label: "Monitoring", Icon: EyeIcon, className: "text-sidebar-foreground" };
    case "approval":
      return {
        label: "Needs approval",
        Icon: ShieldQuestionIcon,
        className: "text-warning-foreground",
      };
    case "input":
      return {
        label: "Needs input",
        Icon: MessageCircleQuestionIcon,
        className: "text-indigo-600 dark:text-indigo-300",
      };
    case "failed":
      return { label: "Error", Icon: CircleAlertIcon, className: "text-red-700 dark:text-red-300" };
    default:
      return attention?.unread
        ? {
            label: "Done",
            Icon: CircleCheckIcon,
            className: "text-emerald-700 dark:text-emerald-300",
          }
        : { label: "Idle", Icon: CircleIcon, className: "" };
  }
}

function navigateToTab(navigate: ReturnType<typeof useNavigate>, tab: PaneTab | null): void {
  if (tab === null) {
    void navigate({ to: "/" });
  } else if (tab.kind === "server") {
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(tab.threadRef),
    });
  } else {
    void navigate({ to: "/draft/$draftId", params: buildDraftThreadRouteParams(tab.draftId) });
  }
}

function TabLine({
  tab,
  shellByKey,
  lastVisitedAtByKey,
  onOpen,
}: {
  readonly tab: PaneTab;
  readonly shellByKey: ShellByKey;
  readonly lastVisitedAtByKey: Readonly<Record<string, string>>;
  readonly onOpen: () => void;
}) {
  const key = tab.kind === "server" ? scopedThreadKey(tab.threadRef) : null;
  const shell = key ? shellByKey.get(key) : undefined;
  const status = tabStatus(tab, shell && key ? tabAttention(shell, lastVisitedAtByKey[key]) : null);
  const title = tab.kind === "draft" ? "New thread" : (shell?.title ?? "Thread");
  return (
    <button
      type="button"
      className="flex h-4 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm pl-6 text-left text-2xs text-sidebar-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
    >
      <status.Icon aria-hidden className={cn("size-2.5 shrink-0", status.className)} />
      <span className={cn("shrink-0 font-medium", status.className)}>{status.label}</span>
      <span className="min-w-0 truncate">{title}</span>
    </button>
  );
}

function TabPullRequestChip({
  tab,
  shell,
}: {
  readonly tab: Extract<PaneTab, { kind: "server" }>;
  readonly shell: SidebarThreadSummary;
}) {
  const navigate = useNavigate();
  const openPrLink = useOpenPrLink(tab.threadRef);
  const link = resolveThreadCurrentPullRequestLink(shell.pullRequests ?? []);
  const snapshot = link ? linkedPullRequestSnapshotStatus(link) : null;
  if (!link || !snapshot) return null;
  return (
    <ThreadPullRequestBadgeControl
      render={<InlineButton />}
      badge={resolveThreadPullRequestBadge(shell.pullRequests)}
      number={link.number}
      url={link.url}
      status={prStatusIndicator(snapshot.pr, snapshot.sourceControlProvider)}
      onOpenStack={() => {
        useRightPanelStore.getState().open(tab.threadRef, "pull-requests");
        navigateToTab(navigate, tab);
      }}
      onOpenPullRequest={(event: MouseEvent<HTMLElement>) => {
        // Opened inside T3 (the right panel): show it beside its thread.
        if (openPrLink(event, link.url, tab.threadRef)) navigateToTab(navigate, tab);
      }}
    />
  );
}

function WorkspaceNameInput({
  workspace,
  onDone,
}: {
  readonly workspace: Workspace;
  readonly onDone: () => void;
}) {
  const [value, setValue] = useState(workspace.name);
  // Enter and Escape settle the rename; the blur that follows must not commit again.
  const settled = useRef(false);
  const settle = (commit: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (commit) useWorkspaceStore.getState().renameWorkspace(workspace.id, value);
    onDone();
  };
  return (
    <input
      autoFocus
      aria-label="Workspace name"
      className="min-w-0 flex-1 rounded-sm border border-input bg-card px-1 text-sm font-semibold text-card-foreground outline-none focus:border-foreground"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => settle(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          settle(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          settle(false);
        }
      }}
    />
  );
}

function WorkspaceRow({
  workspace,
  active,
  jumpHint,
  renaming,
  onRenameStart,
  onRenameDone,
  shellByKey,
  lastVisitedAtByKey,
}: {
  readonly workspace: Workspace;
  readonly active: boolean;
  readonly jumpHint: string | null;
  readonly renaming: boolean;
  readonly onRenameStart: () => void;
  readonly onRenameDone: () => void;
  readonly shellByKey: ShellByKey;
  readonly lastVisitedAtByKey: Readonly<Record<string, string>>;
}) {
  const navigate = useNavigate();
  const tabs = listPanes(workspace.root).flatMap((pane) => pane.tabs);
  const running = tabs.some((tab) => {
    if (tab.kind !== "server") return false;
    const shell = shellByKey.get(scopedThreadKey(tab.threadRef));
    const status = shell ? tabAttention(shell).status : null;
    return status === "working" || status === "monitoring";
  });
  const pullRequests = tabs.flatMap((tab) => {
    if (tab.kind !== "server") return [];
    const shell = shellByKey.get(scopedThreadKey(tab.threadRef));
    return shell?.pullRequests?.length ? [{ tab, shell }] : [];
  });

  const select = () => {
    useWorkspaceStore.getState().selectWorkspace({ id: workspace.id });
    // While the panes are mounted they move the URL themselves; from any other
    // page, go to what the workspace has focused.
    if (!isWorkspaceShortcutsActive()) {
      navigateToTab(navigate, selectFocusedTab(useWorkspaceStore.getState()));
    }
  };

  return (
    <div
      className={cn(
        "group/workspace relative mb-px rounded-md px-2 pt-1 pb-1.5",
        active ? "bg-sidebar-row-active" : "hover:bg-sidebar-row-hover",
      )}
    >
      <div className="flex h-[1.0625rem] min-w-0 items-center gap-1.5 pr-5">
        <span
          aria-hidden
          className={cn(
            "inline-grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-1 text-3xs font-semibold tabular-nums",
            running
              ? "bg-primary text-primary-foreground"
              : tabs.length > 0
                ? "bg-sidebar-foreground/10 text-sidebar-muted-foreground"
                : "border border-sidebar-foreground/15 text-sidebar-muted-foreground",
          )}
        >
          {tabs.length}
        </span>
        {renaming ? (
          <WorkspaceNameInput workspace={workspace} onDone={onRenameDone} />
        ) : (
          <button
            type="button"
            aria-current={active ? "true" : undefined}
            className="min-w-0 flex-1 cursor-pointer truncate rounded-sm text-left text-sm font-semibold text-sidebar-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={select}
            onDoubleClick={onRenameStart}
          >
            {workspace.name}
          </button>
        )}
      </div>
      {tabs.map((tab) => (
        <TabLine
          key={paneTabKey(tab)}
          tab={tab}
          shellByKey={shellByKey}
          lastVisitedAtByKey={lastVisitedAtByKey}
          onOpen={() => navigateToTab(navigate, tab)}
        />
      ))}
      {pullRequests.length > 0 ? (
        <div className="flex min-w-0 gap-1 overflow-hidden pt-0.5 pl-6">
          {pullRequests.map(({ tab, shell }) => (
            <TabPullRequestChip key={paneTabKey(tab)} tab={tab} shell={shell} />
          ))}
        </div>
      ) : null}
      {jumpHint ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 right-1.5 inline-flex h-5 items-center rounded-full border border-border/80 bg-background/95 px-1.5 font-mono text-3xs font-medium tracking-tight text-foreground shadow-sm"
        >
          {jumpHint}
        </span>
      ) : (
        <button
          type="button"
          aria-label={`Close ${workspace.name}`}
          className="absolute top-1 right-1.5 grid size-[1.125rem] cursor-pointer place-items-center rounded-sm text-sidebar-muted-foreground opacity-0 outline-none before:absolute before:-inset-[3px] before:content-[''] group-hover/workspace:opacity-100 hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => closeWorkspaceWithUndo(workspace.id)}
        >
          <XIcon className="size-3" />
        </button>
      )}
    </div>
  );
}

/** ⌘1–9 labels while the modifier that selects workspaces is held. */
function useWorkspaceJumpHints(count: number): ReadonlyArray<string | null> {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const modifiers = useShortcutModifierState();
  const { showThreadJumpHints, updateThreadJumpHintsVisibility } = useThreadJumpHintVisibility();
  const mac = isMacPlatform(navigator.platform);
  const held =
    (mac ? modifiers.metaKey && !modifiers.ctrlKey : modifiers.ctrlKey && !modifiers.metaKey) &&
    !modifiers.altKey &&
    !modifiers.shiftKey;
  useEffect(() => updateThreadJumpHintsVisibility(held), [held, updateThreadJumpHintsVisibility]);
  if (!showThreadJumpHints) return [];
  return Array.from({ length: count }, (_, index) => {
    // ⌘9 is the last workspace, as in cmux.
    const command =
      index === count - 1 && index >= WORKSPACE_SELECT_KEYBINDING_COMMANDS.length - 1
        ? "workspace.select.last"
        : WORKSPACE_SELECT_KEYBINDING_COMMANDS[index];
    return command ? shortcutLabelForCommand(keybindings, command) : null;
  });
}

function SidebarListSwitchRow({
  icon,
  label,
  count,
  onClick,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly count?: number | undefined;
  readonly onClick: () => void;
}) {
  return (
    <div className="shrink-0 px-(--sidebar-content-inset) pb-1">
      <button
        type="button"
        className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-muted-foreground outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0"
        onClick={onClick}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined ? <span className="text-xs tabular-nums">{count}</span> : null}
      </button>
    </div>
  );
}

/** The footer row the classic thread list shows to come back to workspaces. */
export function WorkspacesSwitchRow() {
  const [, setMode] = useWorkspaceSidebarMode();
  return (
    <SidebarListSwitchRow
      icon={<Columns2Icon />}
      label="Workspaces"
      onClick={() => setMode("workspaces")}
    />
  );
}

export default function WorkspaceList() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const shells = useThreadShells();
  const shellByKey = shellMapFor(shells);
  const lastVisitedAtByKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const [, setMode] = useWorkspaceSidebarMode();
  const [renamingId, setRenamingId] = useState<string | null>(() =>
    workspaceRenameRequested ? useWorkspaceStore.getState().activeWorkspaceId : null,
  );
  const jumpHints = useWorkspaceJumpHints(workspaces.length);

  useEffect(() => {
    mountedWorkspaceLists += 1;
    // The initial state already started a requested rename.
    workspaceRenameRequested = false;
    const unsubscribe = onWorkspaceUiCommand((command) => {
      if (command === "workspace.rename") {
        setRenamingId(useWorkspaceStore.getState().activeWorkspaceId);
      }
    });
    return () => {
      mountedWorkspaceLists -= 1;
      unsubscribe();
    };
  }, []);

  const newWorkspace = () => {
    // Through the dispatcher so it seeds a draft like ⌘N; without panes on screen, a blank one.
    if (!dispatchWorkspaceCommand("workspace.new")) useWorkspaceStore.getState().createWorkspace();
  };

  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent
        className="min-h-full"
        fixedHeader={
          <SidebarGroup className="z-[1]">
            <div className="flex h-7 items-center gap-2 pl-2">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-muted-foreground">
                Workspaces
              </span>
              <SidebarHeaderIconButton label="New workspace" onClick={newWorkspace}>
                <PlusIcon />
              </SidebarHeaderIconButton>
            </div>
          </SidebarGroup>
        }
      >
        <SidebarGroup aria-label="Workspaces" role="list">
          {workspaces.map((workspace, index) => (
            <div key={workspace.id} role="listitem">
              <WorkspaceRow
                workspace={workspace}
                active={workspace.id === activeWorkspaceId}
                jumpHint={jumpHints[index] ?? null}
                renaming={renamingId === workspace.id}
                onRenameStart={() => setRenamingId(workspace.id)}
                onRenameDone={() => setRenamingId(null)}
                shellByKey={shellByKey}
                lastVisitedAtByKey={lastVisitedAtByKey}
              />
            </div>
          ))}
        </SidebarGroup>
      </SidebarContent>
      <SidebarListSwitchRow
        icon={<ListIcon />}
        label="All threads"
        count={shells.length}
        onClick={() => setMode("threads")}
      />
      <SidebarChromeFooter />
    </>
  );
}
