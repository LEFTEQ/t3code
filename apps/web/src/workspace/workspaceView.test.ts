import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { DraftId } from "../composerDraftStore";
import { listPanes, type PaneTab } from "./paneTree";
import {
  sanitizePersistedWorkspaces,
  selectActiveWorkspace,
  selectFocusedPane,
  useWorkspaceStore,
} from "./workspaceStore";
import {
  createPaneContextValue,
  enteringRect,
  hasWorkspaceLayout,
  paneDividers,
  visibleLayout,
} from "./workspaceView";

const thread = (id: string): PaneTab => ({
  kind: "server",
  threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(id)),
});
const draft = (id: string): PaneTab => ({ kind: "draft", draftId: id as DraftId });

const store = () => useWorkspaceStore.getState();
const active = () => selectActiveWorkspace(store());
const focusedPaneId = () => active().focusedPaneId;
const tabsByPane = () => listPanes(active().root).map((pane) => pane.tabs);

beforeEach(() => {
  useWorkspaceStore.setState(sanitizePersistedWorkspaces(null));
});

describe("visibleLayout", () => {
  it("always shows the focused pane: whole tree, zoomed pane, or the narrow single pane", () => {
    store().openTarget(thread("A"));
    store().splitFocused("right", thread("B"));
    store().splitFocused("down", thread("C"));
    const shown = (narrow: boolean) =>
      listPanes(visibleLayout(active(), narrow)).map((pane) => pane.id);

    expect(shown(false)).toHaveLength(3);
    expect(shown(false)).toContain(focusedPaneId());
    expect(shown(true)).toEqual([focusedPaneId()]);

    store().toggleZoom();
    expect(shown(false)).toEqual([focusedPaneId()]);
    store().focusDirection("up");
    expect(shown(false)).toHaveLength(3);
  });

  it("keeps the index on the workspace only while it holds a layout", () => {
    expect(hasWorkspaceLayout(active())).toBe(false);
    store().splitFocused("right");
    expect(hasWorkspaceLayout(active())).toBe(true);
  });
});

describe("pane geometry", () => {
  it("draws one divider per split and grows a new pane out of its divider", () => {
    store().openTarget(thread("A"));
    store().splitFocused("right", thread("B"));
    const root = active().root;
    expect(paneDividers(root).map((divider) => divider.split.direction)).toEqual(["row"]);
    expect(enteringRect(root, focusedPaneId())).toEqual({ x: 1, y: 0, width: 0, height: 1 });
  });
});

describe("createPaneContextValue", () => {
  it("swaps a promoted draft in place and closes dismissed targets once", () => {
    store().openTarget(draft("D"));
    const pane = createPaneContextValue(focusedPaneId(), true);
    const locationBefore = pane.readLocationKey();

    void pane.replaceTarget(draft("D"), thread("A"));
    expect(tabsByPane()).toEqual([[thread("A")]]);
    expect(pane.readLocationKey()).not.toBe(locationBefore);

    void pane.dismissTarget(thread("A"));
    void pane.dismissTarget(thread("A"));
    expect(tabsByPane()).toEqual([[]]);
    void pane.replaceTarget(draft("D"), thread("B"));
    expect(tabsByPane()).toEqual([[]]);
  });

  it("drops its copy when the promoted thread is already open in another pane", () => {
    store().openTarget(thread("A"));
    store().splitFocused("right", draft("D"));
    const pane = createPaneContextValue(focusedPaneId(), true);
    void pane.replaceTarget(draft("D"), thread("A"));
    expect(tabsByPane()).toEqual([[thread("A")]]);
    expect(selectFocusedPane(store())?.tabs).toEqual([thread("A")]);
  });

  it("opens targets into its own pane, even when another pane was focused", () => {
    store().openTarget(thread("A"));
    const left = createPaneContextValue(focusedPaneId(), false);
    store().splitFocused("right", thread("B"));
    void left.openTarget(thread("C"));
    expect(tabsByPane()).toEqual([[thread("A"), thread("C")], [thread("B")]]);
  });

  it("still reaches its own pane after a workspace switch", () => {
    store().openTarget(thread("A"));
    const home = active().id;
    const pane = createPaneContextValue(focusedPaneId(), true);
    store().createWorkspace();

    void pane.openTarget(thread("B"));
    expect(active().id).toBe(home);
    expect(tabsByPane()).toEqual([[thread("A"), thread("B")]]);

    store().selectWorkspace("next");
    void pane.dismissTarget(thread("A"));
    expect(active().id).not.toBe(home);
    expect(listPanes(store().workspaces[0]!.root).map((leaf) => leaf.tabs)).toEqual([
      [thread("B")],
    ]);
  });
});
