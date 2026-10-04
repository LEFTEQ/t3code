import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId, type WorkspaceKeybindingCommand } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { PaneTab } from "./paneTree";
import { PANE_RESIZE_STEP_PX, runWorkspaceCommand } from "./useWorkspaceShortcuts";
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
const run = (
  command: WorkspaceKeybindingCommand,
  container: { width: number; height: number } | null = { width: 1000, height: 600 },
) =>
  runWorkspaceCommand(command, store(), {
    containerSize: () => container,
    openNewTab: () => {},
    emit: () => {},
  });
const rootRatio = () => {
  const root = selectActiveWorkspace(store()).root;
  return root.kind === "split" ? root.ratio : null;
};

beforeEach(() => {
  useWorkspaceStore.setState(sanitizePersistedWorkspaces(null));
});

describe("runWorkspaceCommand", () => {
  it("maps numbered tab and workspace commands to positions, with 9 meaning the last", () => {
    for (const id of ["A", "B", "C"]) store().newTab(thread(id));
    run("tab.select.1");
    expect(selectFocusedTab(store())).toEqual(thread("A"));
    run("tab.select.last");
    expect(selectFocusedTab(store())).toEqual(thread("C"));
    run("tab.select.5");
    expect(selectFocusedTab(store())).toEqual(thread("C"));

    store().createWorkspace();
    store().createWorkspace();
    run("workspace.select.1");
    expect(selectActiveWorkspace(store()).name).toBe("Workspace 1");
    run("workspace.select.last");
    expect(selectActiveWorkspace(store()).name).toBe("Workspace 3");
  });

  it("resizes by cmux's step against the pane tree's size, and not without one", () => {
    run("workspace.splitRight");
    const before = rootRatio();
    run("pane.resizeLeft");
    expect(Math.abs((rootRatio() ?? 0) - (before ?? 0))).toBeCloseTo(PANE_RESIZE_STEP_PX / 1000);

    const resized = rootRatio();
    run("pane.resizeLeft", null);
    expect(rootRatio()).toBe(resized);
  });
});
