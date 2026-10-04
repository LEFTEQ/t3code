import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  type AttentionShell,
  latestWaitingTab,
  paneAttentionEdge,
  tabAttention,
  waitingTabs,
} from "./attention";
import { type PaneTab, createPaneLeaf } from "./paneTree";
import type { Workspace } from "./workspaceStore";

const session = {
  threadId: ThreadId.make("t"),
  status: "ready" as const,
  providerName: null,
  runtimeMode: "full-access" as const,
  activeTurnId: null,
  lastError: null,
  updatedAt: "2026-10-04T10:00:00.000Z",
};

function shell(overrides: Partial<AttentionShell> = {}): AttentionShell {
  return {
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "default",
    latestTurn: null,
    session: null,
    updatedAt: "2026-10-04T10:00:00.000Z",
    ...overrides,
  };
}

const completedTurn = (completedAt: string) => ({
  turnId: "turn-1" as never,
  state: "completed" as const,
  assistantMessageId: null,
  requestedAt: "2026-10-04T09:00:00.000Z",
  startedAt: "2026-10-04T09:00:00.000Z",
  completedAt,
});

const tab = (id: string): Extract<PaneTab, { kind: "server" }> => ({
  kind: "server",
  threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(id)),
});
const keyOf = (id: string) => scopedThreadKey(tab(id).threadRef);

function workspace(id: string, tabs: PaneTab[]): Workspace {
  const pane = createPaneLeaf(`${id}-pane`, tabs);
  return { id, name: id, root: pane, focusedPaneId: pane.id, zoomedPaneId: null, closedTabs: [] };
}

describe("tabAttention", () => {
  it("derives the sidebar's states from the shell summary", () => {
    expect(tabAttention(shell({ hasPendingApprovals: true })).status).toBe("approval");
    expect(tabAttention(shell({ hasPendingUserInput: true })).status).toBe("input");
    expect(tabAttention(shell({ session: { ...session, status: "error" } })).status).toBe("failed");
    expect(tabAttention(shell({ session: { ...session, status: "running" } })).status).toBe(
      "working",
    );
    expect(tabAttention(shell()).status).toBe("ready");
  });

  it("marks a completion after the last visit as unread, and never-visited as read", () => {
    const done = shell({ latestTurn: completedTurn("2026-10-04T10:05:00.000Z") });
    expect(tabAttention(done, "2026-10-04T10:00:00.000Z").unread).toBe(true);
    expect(tabAttention(done, "2026-10-04T10:06:00.000Z").unread).toBe(false);
    expect(tabAttention(done).unread).toBe(false);
  });
});

describe("paneAttentionEdge", () => {
  it("shows the most urgent tab: approval over input over error", () => {
    const input = tabAttention(shell({ hasPendingUserInput: true }));
    const approval = tabAttention(shell({ hasPendingApprovals: true }));
    const failed = tabAttention(shell({ session: { ...session, status: "error" } }));
    expect(paneAttentionEdge([failed, input, null])).toBe("input");
    expect(paneAttentionEdge([input, approval])).toBe("approval");
    expect(paneAttentionEdge([failed])).toBe("error");
    expect(paneAttentionEdge([tabAttention(shell()), null])).toBeNull();
  });
});

describe("waitingTabs and latestWaitingTab", () => {
  const shells = new Map<string, AttentionShell>([
    [keyOf("old-input"), shell({ hasPendingUserInput: true, updatedAt: "2026-10-04T09:00:00Z" })],
    [
      keyOf("new-approval"),
      shell({ hasPendingApprovals: true, updatedAt: "2026-10-04T11:00:00Z" }),
    ],
    [keyOf("failed"), shell({ session: { ...session, status: "error" } })],
    [keyOf("unread"), shell({ latestTurn: completedTurn("2026-10-04T12:00:00.000Z") })],
    [keyOf("idle"), shell()],
  ]);
  const visited = { [keyOf("unread")]: "2026-10-04T10:00:00.000Z" };
  const workspaces = [
    workspace("dev", [tab("old-input"), tab("idle"), tab("unread")]),
    workspace("infra", [tab("failed"), tab("new-approval")]),
  ];

  it("orders waiting tabs across workspaces: needs-you newest first, then failed, then unread", () => {
    const waiting = waitingTabs(workspaces, shells, visited);
    expect(waiting.map((entry) => entry.tab.threadRef.threadId)).toEqual([
      "new-approval",
      "old-input",
      "failed",
      "unread",
    ]);
    expect(waiting[0]?.workspaceId).toBe("infra");
  });

  it("jumps to the newest waiting tab, moving past the one already focused", () => {
    const waiting = waitingTabs(workspaces, shells, visited);
    expect(latestWaitingTab(waiting, null)?.tab).toEqual(tab("new-approval"));
    expect(latestWaitingTab(waiting, tab("new-approval"))?.tab).toEqual(tab("old-input"));
    expect(latestWaitingTab(waiting.slice(0, 1), tab("new-approval"))?.tab).toEqual(
      tab("new-approval"),
    );
    expect(latestWaitingTab([], null)).toBeNull();
  });
});
