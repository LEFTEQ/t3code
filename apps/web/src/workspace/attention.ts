import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";

import {
  type SidebarThreadStatus,
  hasUnseenCompletion,
  resolveSidebarThreadStatus,
} from "../components/Sidebar.logic";
import { useThreadShell, useThreadShells } from "../state/entities";
import type { SidebarThreadSummary } from "../types";
import { useUiStateStore } from "../uiStateStore";
import { type PaneId, type PaneTab, listPanes, samePaneTab } from "./paneTree";
import type { Workspace } from "./workspaceStore";

/** The shell-summary fields attention reads; never thread detail. */
export type AttentionShell = Pick<
  SidebarThreadSummary,
  | "hasActionableProposedPlan"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "interactionMode"
  | "latestTurn"
  | "session"
  | "backgroundLiveness"
  | "updatedAt"
>;

export interface TabAttention {
  /** Same vocabulary and precedence as the sidebar, so a thread reads alike everywhere. */
  readonly status: SidebarThreadStatus;
  /** Completed since the last visit (never-visited counts as read, like the sidebar). */
  readonly unread: boolean;
  /** When the current state began (ms epoch), for "latest waiting" ordering. */
  readonly since: number | null;
}

/** The pane's 2px top edge: blue input, amber approval, red error. */
export type PaneAttentionEdge = "input" | "approval" | "error";

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function tabAttention(shell: AttentionShell, lastVisitedAt?: string): TabAttention {
  const status = resolveSidebarThreadStatus(shell);
  const unread = hasUnseenCompletion({ ...shell, lastVisitedAt });
  const since =
    status === "approval" || status === "input" || status === "failed"
      ? (parseMs(shell.session?.updatedAt) ?? parseMs(shell.updatedAt))
      : status === "working" || status === "monitoring"
        ? parseMs(shell.latestTurn?.startedAt)
        : parseMs(shell.latestTurn?.completedAt);
  return { status, unread, since };
}

export function needsUser(attention: TabAttention | null): boolean {
  return attention?.status === "approval" || attention?.status === "input";
}

const EDGE_PRIORITY: Record<PaneAttentionEdge, number> = { approval: 3, input: 2, error: 1 };

function edgeFor(attention: TabAttention | null): PaneAttentionEdge | null {
  if (attention?.status === "approval") return "approval";
  if (attention?.status === "input") return "input";
  if (attention?.status === "failed") return "error";
  return null;
}

/** The most urgent state among a pane's tabs, so a waiting background tab still marks its pane. */
export function paneAttentionEdge(
  attentions: ReadonlyArray<TabAttention | null>,
): PaneAttentionEdge | null {
  let best: PaneAttentionEdge | null = null;
  for (const attention of attentions) {
    const edge = edgeFor(attention);
    if (edge !== null && (best === null || EDGE_PRIORITY[edge] > EDGE_PRIORITY[best])) best = edge;
  }
  return best;
}

export interface WaitingTab {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly paneId: PaneId;
  /** 1-based position of the pane in reading order, for display. */
  readonly paneNumber: number;
  readonly tab: Extract<PaneTab, { kind: "server" }>;
  readonly attention: TabAttention;
}

// Approval and input ask for the user; a failure needs a look; unread work is merely ready.
function waitingRank(attention: TabAttention): number | null {
  if (needsUser(attention)) return 0;
  if (attention.status === "failed") return 1;
  if (attention.unread && attention.status === "ready") return 2;
  return null;
}

/**
 * Every tab across all workspaces that waits on the user, most urgent first and
 * newest first within a rank. Reads shell summaries only.
 */
export function waitingTabs(
  workspaces: ReadonlyArray<Workspace>,
  shellByKey: ReadonlyMap<string, AttentionShell>,
  lastVisitedAtByKey: Readonly<Record<string, string>>,
): WaitingTab[] {
  const ranked: Array<{ readonly entry: WaitingTab; readonly rank: number }> = [];
  for (const workspace of workspaces) {
    for (const [paneIndex, pane] of listPanes(workspace.root).entries()) {
      for (const tab of pane.tabs) {
        if (tab.kind !== "server") continue;
        const key = scopedThreadKey(tab.threadRef);
        const shell = shellByKey.get(key);
        if (!shell) continue;
        const attention = tabAttention(shell, lastVisitedAtByKey[key]);
        const rank = waitingRank(attention);
        if (rank === null) continue;
        ranked.push({
          entry: {
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            paneId: pane.id,
            paneNumber: paneIndex + 1,
            tab,
            attention,
          },
          rank,
        });
      }
    }
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      (b.entry.attention.since ?? Number.NEGATIVE_INFINITY) -
        (a.entry.attention.since ?? Number.NEGATIVE_INFINITY),
  );
  return ranked.map(({ entry }) => entry);
}

/**
 * The ⌘⇧U target: the newest tab waiting on the user. The focused tab is
 * skipped while another one waits, so repeated presses move on.
 */
export function latestWaitingTab(
  waiting: ReadonlyArray<WaitingTab>,
  focusedTab: PaneTab | null,
): WaitingTab | null {
  const other = waiting.find((entry) => !focusedTab || !samePaneTab(entry.tab, focusedTab));
  return other ?? waiting[0] ?? null;
}

const shellMaps = new WeakMap<
  ReadonlyArray<SidebarThreadSummary>,
  ReadonlyMap<string, SidebarThreadSummary>
>();

/** One key → shell map per shells snapshot, shared by every reader of that snapshot. */
export function shellMapFor(
  shells: ReadonlyArray<SidebarThreadSummary>,
): ReadonlyMap<string, SidebarThreadSummary> {
  let map = shellMaps.get(shells);
  if (!map) {
    map = new Map(
      shells.map((shell) => [
        scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id)),
        shell,
      ]),
    );
    shellMaps.set(shells, map);
  }
  return map;
}

/** Attention for one tab; drafts have none. */
export function useTabAttention(tab: PaneTab): TabAttention | null {
  const threadRef = tab.kind === "server" ? tab.threadRef : null;
  const shell = useThreadShell(threadRef);
  const lastVisitedAt = useUiStateStore((state) =>
    threadRef ? state.threadLastVisitedAtById[scopedThreadKey(threadRef)] : undefined,
  );
  return shell ? tabAttention(shell, lastVisitedAt) : null;
}

/** The pane's edge across all of its tabs. */
export function usePaneAttentionEdge(tabs: ReadonlyArray<PaneTab>): PaneAttentionEdge | null {
  const shellByKey = shellMapFor(useThreadShells());
  const lastVisitedAtByKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  return paneAttentionEdge(
    tabs.map((tab) => {
      if (tab.kind !== "server") return null;
      const key = scopedThreadKey(tab.threadRef);
      const shell = shellByKey.get(key);
      return shell ? tabAttention(shell, lastVisitedAtByKey[key]) : null;
    }),
  );
}
