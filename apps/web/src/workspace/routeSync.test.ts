import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { listPanes, paneTabKey, type PaneTab } from "./paneTree";
import { type RouteSyncState, planRouteSync } from "./routeSync";
import {
  sanitizePersistedWorkspaces,
  selectActiveWorkspace,
  selectFocusedTab,
  useWorkspaceStore,
} from "./workspaceStore";

const thread = (id: string): PaneTab => ({
  kind: "server",
  threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(id)),
});

const store = () => useWorkspaceStore.getState();

/**
 * Runs the host's sync loop against the real store and a fake router until
 * both agree, returning the final URL target and how many passes it took.
 */
function settle(initialRoute: PaneTab | null, previous: RouteSyncState | null) {
  let route = initialRoute;
  let synced = previous;
  for (let pass = 1; pass <= 5; pass += 1) {
    const { action, next } = planRouteSync(synced, route, selectFocusedTab(store()));
    synced = next;
    if (action.kind === "none") return { route, passes: pass, synced };
    if (action.kind === "open") store().openTarget(action.target);
    if (action.kind === "navigate") route = action.target;
  }
  throw new Error("route sync did not settle");
}

beforeEach(() => {
  useWorkspaceStore.setState(sanitizePersistedWorkspaces(null));
});

describe("planRouteSync", () => {
  it("opens a deep-linked thread in the focused pane", () => {
    store().openTarget(thread("A"));
    const { route } = settle(thread("B"), null);
    expect(route).toEqual(thread("B"));
    expect(listPanes(selectActiveWorkspace(store()).root)[0]!.tabs).toEqual([
      thread("A"),
      thread("B"),
    ]);
  });

  it("moves the URL to the focused tab when the index route has no target", () => {
    store().openTarget(thread("A"));
    expect(settle(null, null).route).toEqual(thread("A"));
  });

  it("follows pane focus with the URL and settles without looping", () => {
    store().openTarget(thread("A"));
    store().splitFocused("right", thread("B"));
    const first = settle(thread("B"), null);
    store().focusDirection("left");
    const second = settle(first.route, first.synced);
    expect(second.route).toEqual(thread("A"));
    expect(second.passes).toBe(2);
  });

  it("focuses a thread already open elsewhere instead of opening it twice", () => {
    store().openTarget(thread("A"));
    store().splitFocused("right", thread("B"));
    const first = settle(thread("B"), null);
    const second = settle(thread("A"), first.synced);
    expect(second.route).toEqual(thread("A"));
    expect(listPanes(selectActiveWorkspace(store()).root).map((pane) => pane.tabs)).toEqual([
      [thread("A")],
      [thread("B")],
    ]);
  });

  it("lets an explicit navigation win when the router and the workspace both moved", () => {
    const keyA = paneTabKey(thread("A"));
    expect(
      planRouteSync({ routeKey: keyA, focusedKey: keyA }, thread("C"), thread("B")).action,
    ).toEqual({ kind: "open", target: thread("C") });
  });

  it("sends the URL to the index when the focused pane is empty", () => {
    store().openTarget(thread("A"));
    const first = settle(thread("A"), null);
    store().splitFocused("down");
    expect(settle(first.route, first.synced).route).toBeNull();
  });
});
