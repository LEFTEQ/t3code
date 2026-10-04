import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  type EnvironmentId,
  ProjectId,
  ThreadId,
  type WorkspaceKeybindingCommand,
} from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import type { DraftId } from "../composerDraftStore";
import { listPanes, type PaneTab } from "./paneTree";
import {
  PANE_RESIZE_STEP_PX,
  openSeededWorkspace,
  runWorkspaceCommand,
} from "./useWorkspaceShortcuts";
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
    openNewWorkspace: () => {},
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
    store().splitFocused("right");
    const before = rootRatio();
    run("pane.resizeLeft");
    expect(Math.abs((rootRatio() ?? 0) - (before ?? 0))).toBeCloseTo(PANE_RESIZE_STEP_PX / 1000);

    const resized = rootRatio();
    run("pane.resizeLeft", null);
    expect(rootRatio()).toBe(resized);
  });
});

describe("openSeededWorkspace", () => {
  const projectRef = scopeProjectRef("env-1" as EnvironmentId, ProjectId.make("vybava"));
  const draft = (id: string): PaneTab => ({ kind: "draft", draftId: id as DraftId });
  // Stands in for the new-thread handler: resolves to one draft and either presents it or,
  // like the handler when that draft is already the focused tab, only returns it.
  const newThreadHandler =
    (
      draftId: string,
      presents: boolean,
    ): Parameters<typeof openSeededWorkspace>[0]["handleNewThread"] =>
    async (_projectRef, options) => {
      if (presents) await options?.present?.(draft(draftId), { replace: false });
      return { draftId: draftId as DraftId, threadId: ThreadId.make(`thread-${draftId}`) };
    };
  const activeTabs = () =>
    listPanes(selectActiveWorkspace(store()).root).flatMap((pane) => pane.tabs);

  it("names the new workspace after the project and seeds it with the project's draft", async () => {
    await openSeededWorkspace({
      projectRef,
      projectName: "vybava",
      handleNewThread: newThreadHandler("d1", true),
    });
    expect(selectActiveWorkspace(store()).name).toBe("vybava");
    expect(activeTabs()).toEqual([draft("d1")]);

    await openSeededWorkspace({
      projectRef,
      projectName: "vybava",
      handleNewThread: newThreadHandler("d2", true),
    });
    expect(store().workspaces.map((workspace) => workspace.name)).toEqual([
      "Workspace 1",
      "vybava",
      "vybava 2",
    ]);
  });

  it("moves the project's draft in when it was already the focused tab", async () => {
    store().newTab(draft("d1"));
    await openSeededWorkspace({
      projectRef,
      projectName: "vybava",
      handleNewThread: newThreadHandler("d1", false),
    });
    expect(selectActiveWorkspace(store()).name).toBe("vybava");
    expect(activeTabs()).toEqual([draft("d1")]);
    expect(store().workspaces[0]!.root).toMatchObject({ kind: "pane", tabs: [] });
  });

  it("opens a blank numbered workspace when there is no project to inherit", async () => {
    await openSeededWorkspace({
      projectRef: null,
      projectName: undefined,
      handleNewThread: newThreadHandler("d1", true),
    });
    expect(selectActiveWorkspace(store()).name).toBe("Workspace 2");
    expect(activeTabs()).toEqual([]);
  });
});
