import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { DraftId } from "../composerDraftStore";
import { listPanes, type PaneTab } from "./paneTree";
import {
  sanitizePersistedWorkspaces,
  selectActiveWorkspace,
  selectFocusedPane,
  selectFocusedTab,
  useWorkspaceStore,
} from "./workspaceStore";

const thread = (id: string): PaneTab => ({
  kind: "server",
  threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(id)),
});
const draft = (id: string): PaneTab => ({ kind: "draft", draftId: id as DraftId });

const store = () => useWorkspaceStore.getState();
const active = () => selectActiveWorkspace(store());
const paneTabs = () => listPanes(active().root).map((pane) => pane.tabs);

beforeEach(() => {
  useWorkspaceStore.setState(sanitizePersistedWorkspaces(null));
});

describe("workspaceStore", () => {
  it("starts with one empty workspace", () => {
    expect(store().workspaces.map((workspace) => workspace.name)).toEqual(["Workspace 1"]);
    expect(selectFocusedPane(store())?.tabs).toEqual([]);
  });

  it("opens a thread once and focuses wherever it already is", () => {
    store().openTarget(thread("A"));
    store().splitFocused("right");
    store().openTarget(thread("B"));
    store().openTarget(thread("A"));
    expect(paneTabs()).toEqual([[thread("A")], [thread("B")]]);
    expect(selectFocusedTab(store())).toEqual(thread("A"));

    store().createWorkspace();
    store().openTarget(thread("B"));
    expect(active().name).toBe("Workspace 1");
    expect(selectFocusedTab(store())).toEqual(thread("B"));
  });

  it("opens a new thread in a split to the right and focuses it", () => {
    store().openTarget(thread("A"));
    store().openTarget(thread("B"), { placement: "splitRight" });
    expect(active().root).toMatchObject({ kind: "split", direction: "row" });
    expect(selectFocusedTab(store())).toEqual(thread("B"));
  });

  it("moves focus between panes and ignores the outer edge", () => {
    store().openTarget(thread("A"));
    store().splitFocused("down", thread("B"));
    store().focusDirection("up");
    expect(selectFocusedTab(store())).toEqual(thread("A"));
    store().focusDirection("up");
    expect(selectFocusedTab(store())).toEqual(thread("A"));
  });

  it("collapses a closed pane, focuses its sibling and reopens the tab", () => {
    store().openTarget(thread("A"));
    store().splitFocused("right", thread("B"));
    store().closeTab();
    expect(paneTabs()).toEqual([[thread("A")]]);
    expect(selectFocusedTab(store())).toEqual(thread("A"));

    store().reopenClosedTab();
    expect(paneTabs()).toEqual([[thread("A"), thread("B")]]);
    expect(active().closedTabs).toEqual([]);
  });

  it("closes the other tabs into the reopen stack", () => {
    store().newTab(thread("A"));
    store().newTab(thread("B"));
    store().newTab(thread("C"));
    store().selectTab(1);
    store().closeOtherTabs();
    expect(paneTabs()).toEqual([[thread("B")]]);
    expect(active().closedTabs).toEqual([thread("A"), thread("C")]);
  });

  it("wraps tab selection", () => {
    store().newTab(thread("A"));
    store().newTab(thread("B"));
    store().selectTab("next");
    expect(selectFocusedTab(store())).toEqual(thread("A"));
    store().selectTab("previous");
    expect(selectFocusedTab(store())).toEqual(thread("B"));
    store().selectTab(5);
    expect(selectFocusedTab(store())).toEqual(thread("B"));
  });

  it("moves the selected tab and follows it with focus", () => {
    store().newTab(thread("A"));
    store().newTab(thread("B"));
    store().splitFocused("right", thread("C"));
    store().focusDirection("left");
    store().moveTab("right");
    expect(paneTabs()).toEqual([[thread("A")], [thread("C"), thread("B")]]);
    expect(selectFocusedTab(store())).toEqual(thread("B"));
  });

  it("unzooms when focus moves to another pane", () => {
    store().openTarget(thread("A"));
    store().splitFocused("right", thread("B"));
    store().toggleZoom();
    expect(active().zoomedPaneId).toBe(active().focusedPaneId);
    store().focusDirection("left");
    expect(active().zoomedPaneId).toBeNull();
  });

  it("moves a seed tab into a new workspace and replaces the last closed workspace", () => {
    store().openTarget(draft("d1"));
    const first = active().id;
    store().createWorkspace({ seed: draft("d1") });
    expect(active().name).toBe("Workspace 2");
    expect(paneTabs()).toEqual([[draft("d1")]]);
    expect(store().workspaces[0]!.root).toMatchObject({ kind: "pane", tabs: [] });

    store().selectWorkspace("next");
    expect(active().id).toBe(first);
    store().closeWorkspace(first);
    store().closeWorkspace(active().id);
    expect(store().workspaces.map((workspace) => workspace.name)).toEqual(["Workspace 1"]);
  });

  it("swaps a promoted draft in place", () => {
    store().newTab(draft("d1"));
    store().newTab(thread("B"));
    store().replaceTab(active().focusedPaneId, draft("d1"), thread("A"));
    expect(paneTabs()).toEqual([[thread("A"), thread("B")]]);
  });

  it("reloads a stored layout and falls back on unreadable data", () => {
    store().openTarget(thread("A"));
    store().splitFocused("down", draft("d1"));
    const stored = JSON.parse(
      JSON.stringify({
        workspaces: store().workspaces,
        activeWorkspaceId: store().activeWorkspaceId,
      }),
    );
    expect(sanitizePersistedWorkspaces(stored)).toEqual({
      workspaces: store().workspaces,
      activeWorkspaceId: store().activeWorkspaceId,
    });

    const merge = useWorkspaceStore.persist.getOptions().merge!;
    for (const corrupt of [null, "x", { workspaces: [{ id: 1 }] }, { workspaces: "nope" }]) {
      const merged = merge(corrupt, store());
      expect(merged.workspaces).toHaveLength(1);
      expect(listPanes(merged.workspaces[0]!.root)).toHaveLength(1);
    }
  });
});
