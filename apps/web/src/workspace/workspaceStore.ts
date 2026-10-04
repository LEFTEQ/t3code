/**
 * Device-local workspaces: named layouts of split panes holding thread tabs.
 *
 * Only layout lives here. Threads, drafts and their panels keep their own
 * stores; a tab is just the route target it would open. A thread is shown at
 * most once across all workspaces, so opening it again focuses where it is.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import { resolveStorage } from "../lib/storage";
import { randomUUID } from "../lib/utils";
import {
  addTab,
  adjacentPaneInOrder,
  createPaneLeaf,
  equalize,
  findPane,
  findTabLocation,
  listPanes,
  moveTab,
  neighbourPane,
  removeTab,
  reorderTab,
  replaceTab,
  resizePane,
  samePaneTab,
  selectTabAt,
  selectedTab,
  setSplitRatio,
  splitPane,
  type FocusDirection,
  type PaneId,
  type PaneLeaf,
  type PaneNode,
  type PaneTab,
} from "./paneTree";

export interface Workspace {
  id: string;
  name: string;
  root: PaneNode;
  focusedPaneId: PaneId;
  zoomedPaneId: PaneId | null;
  /** Most recently closed last. */
  closedTabs: PaneTab[];
}

interface WorkspaceLayoutState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

type TabChoice = number | "previous" | "next" | "last";
type WorkspaceChoice = TabChoice | { id: string };

interface WorkspaceStoreState extends WorkspaceLayoutState {
  openTarget: (target: PaneTab, opts?: { placement?: "focused" | "splitRight" }) => void;
  replaceTab: (paneId: PaneId, from: PaneTab, to: PaneTab) => void;
  newTab: (target: PaneTab) => void;
  splitFocused: (direction: "right" | "down", tab?: PaneTab) => void;
  /**
   * Splits the focused pane and moves `tab` there from wherever it sits in the
   * active workspace, like cmux carrying a surface into a new split. The
   * focused tab itself, or a tab only another workspace holds, stays put and
   * the split opens empty.
   */
  splitFocusedMoving: (direction: "right" | "down", tab: PaneTab) => void;
  focusPane: (paneId: PaneId) => void;
  focusDirection: (direction: FocusDirection) => void;
  selectTab: (which: TabChoice) => void;
  closeTab: (paneId?: PaneId, index?: number) => void;
  /** Closes a tab whose thread is gone (deleted, promoted away); never reopenable. */
  dismissTab: (paneId: PaneId, index: number) => void;
  /** `dismissTab` for a gone target in every workspace, and off every reopen list. */
  dismissEverywhere: (tab: PaneTab) => void;
  reopenClosedTab: () => void;
  closeOtherTabs: () => void;
  moveTab: (direction: FocusDirection | "previousPane" | "nextPane") => void;
  reorderTab: (delta: -1 | 1) => void;
  toggleZoom: () => void;
  equalize: () => void;
  resizeFocused: (
    direction: FocusDirection,
    stepPx: number,
    container: { width: number; height: number },
  ) => void;
  setRatio: (splitId: string, ratio: number) => void;
  createWorkspace: (opts?: { name?: string | undefined; seed?: PaneTab | undefined }) => void;
  selectWorkspace: (which: WorkspaceChoice) => void;
  renameWorkspace: (id: string, name: string) => void;
  closeWorkspace: (id: string) => void;
  /** Undoes a close: puts the workspace back at `index`, minus tabs opened elsewhere since. */
  restoreWorkspace: (workspace: Workspace, index: number) => void;
}

const WORKSPACE_STORAGE_KEY = "t3code:workspaces:v1";
const WORKSPACE_STORAGE_VERSION = 1;
const CLOSED_TABS_LIMIT = 20;

function createWorkspaceRecord(name: string, tabs: readonly PaneTab[] = []): Workspace {
  const pane = createPaneLeaf(randomUUID(), tabs);
  return {
    id: randomUUID(),
    name,
    root: pane,
    focusedPaneId: pane.id,
    zoomedPaneId: null,
    closedTabs: [],
  };
}

function nextWorkspaceName(workspaces: readonly Workspace[]): string {
  const taken = new Set(workspaces.map((workspace) => workspace.name));
  let index = workspaces.length + 1;
  while (taken.has(`Workspace ${index}`)) index += 1;
  return `Workspace ${index}`;
}

/** A requested name, numbered when another workspace already uses it ("vybava 2"). */
function uniqueWorkspaceName(workspaces: readonly Workspace[], name: string): string {
  const taken = new Set(workspaces.map((workspace) => workspace.name));
  if (!taken.has(name)) return name;
  let index = 2;
  while (taken.has(`${name} ${index}`)) index += 1;
  return `${name} ${index}`;
}

function freshLayout(): WorkspaceLayoutState {
  const workspace = createWorkspaceRecord("Workspace 1");
  return { workspaces: [workspace], activeWorkspaceId: workspace.id };
}

export function selectActiveWorkspace(state: WorkspaceLayoutState): Workspace {
  return (
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ??
    state.workspaces[0]!
  );
}

export function selectFocusedPane(state: WorkspaceLayoutState): PaneLeaf | null {
  const workspace = selectActiveWorkspace(state);
  return findPane(workspace.root, workspace.focusedPaneId);
}

export function selectFocusedTab(state: WorkspaceLayoutState): PaneTab | null {
  const pane = selectFocusedPane(state);
  return pane ? selectedTab(pane) : null;
}

function withRoot(
  workspace: Workspace,
  root: PaneNode,
  focusedPaneId = workspace.focusedPaneId,
): Workspace {
  const focused = findPane(root, focusedPaneId) ? focusedPaneId : listPanes(root)[0]!.id;
  const zoomedPaneId =
    workspace.zoomedPaneId && findPane(root, workspace.zoomedPaneId)
      ? workspace.zoomedPaneId
      : null;
  return { ...workspace, root, focusedPaneId: focused, zoomedPaneId };
}

/** Moving focus off a zoomed pane unzooms, so the focused pane is always visible. */
function withFocus(workspace: Workspace, paneId: PaneId): Workspace {
  if (!findPane(workspace.root, paneId)) return workspace;
  const zoomedPaneId = workspace.zoomedPaneId === paneId ? paneId : null;
  return { ...workspace, focusedPaneId: paneId, zoomedPaneId };
}

function pushClosed(closedTabs: readonly PaneTab[], tabs: readonly PaneTab[]): PaneTab[] {
  return [...closedTabs, ...tabs].slice(-CLOSED_TABS_LIMIT);
}

function replaceWorkspace(
  state: WorkspaceLayoutState,
  next: Workspace,
): { workspaces: Workspace[] } {
  return {
    workspaces: state.workspaces.map((workspace) => (workspace.id === next.id ? next : workspace)),
  };
}

function updateActive(
  state: WorkspaceLayoutState,
  update: (workspace: Workspace) => Workspace,
): Partial<WorkspaceLayoutState> {
  const workspace = selectActiveWorkspace(state);
  const next = update(workspace);
  return next === workspace ? {} : replaceWorkspace(state, next);
}

/** Removes a tab from the active workspace; only user closes are remembered for reopen. */
function closeTabIn(
  state: WorkspaceLayoutState,
  paneId: PaneId | undefined,
  index: number | undefined,
  remember: boolean,
): Partial<WorkspaceLayoutState> {
  return updateActive(state, (workspace) => {
    const pane = findPane(workspace.root, paneId ?? workspace.focusedPaneId);
    if (!pane) return workspace;
    const { root, removed, collapsedInto } = removeTab(
      workspace.root,
      pane.id,
      index ?? pane.selectedIndex,
    );
    if (!removed) return workspace;
    const focusedPaneId =
      collapsedInto && workspace.focusedPaneId === pane.id
        ? collapsedInto
        : workspace.focusedPaneId;
    const next = withRoot(workspace, root, focusedPaneId);
    return remember ? { ...next, closedTabs: pushClosed(workspace.closedTabs, [removed]) } : next;
  });
}

function pickIndex(which: TabChoice, current: number, length: number): number | null {
  if (length === 0) return null;
  if (which === "last") return length - 1;
  if (which === "previous") return (current - 1 + length) % length;
  if (which === "next") return (current + 1) % length;
  return which >= 0 && which < length ? which : null;
}

/** Focuses the tab wherever it is open (activating its workspace); false when it is not open. */
function focusExisting(
  state: WorkspaceLayoutState,
  target: PaneTab,
): Partial<WorkspaceLayoutState> | null {
  const ordered = [
    selectActiveWorkspace(state),
    ...state.workspaces.filter((workspace) => workspace.id !== state.activeWorkspaceId),
  ];
  for (const workspace of ordered) {
    const location = findTabLocation(workspace.root, target);
    if (!location) continue;
    const next = withFocus(
      { ...workspace, root: selectTabAt(workspace.root, location.paneId, location.index) },
      location.paneId,
    );
    return { ...replaceWorkspace(state, next), activeWorkspaceId: workspace.id };
  }
  return null;
}

function splitWorkspace(
  workspace: Workspace,
  direction: "right" | "down",
  tab?: PaneTab,
): Workspace {
  const paneId = randomUUID();
  const root = splitPane(
    workspace.root,
    workspace.focusedPaneId,
    direction,
    { splitId: randomUUID(), paneId },
    tab,
  );
  return withFocus(withRoot(workspace, root), paneId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeTab(value: unknown): PaneTab | null {
  if (!isRecord(value)) return null;
  if (value.kind === "draft" && typeof value.draftId === "string" && value.draftId) {
    return { kind: "draft", draftId: value.draftId as DraftId };
  }
  const threadRef = value.threadRef;
  if (
    value.kind === "server" &&
    isRecord(threadRef) &&
    typeof threadRef.environmentId === "string" &&
    typeof threadRef.threadId === "string"
  ) {
    return {
      kind: "server",
      threadRef: scopeThreadRef(
        EnvironmentId.make(threadRef.environmentId),
        ThreadId.make(threadRef.threadId),
      ),
    };
  }
  return null;
}

function sanitizeNode(value: unknown): PaneNode | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (value.kind === "pane") {
    const tabs = Array.isArray(value.tabs)
      ? value.tabs.flatMap((tab) => sanitizeTab(tab) ?? [])
      : [];
    const selectedIndex =
      typeof value.selectedIndex === "number" && Number.isInteger(value.selectedIndex)
        ? Math.min(Math.max(value.selectedIndex, 0), Math.max(tabs.length - 1, 0))
        : 0;
    return { kind: "pane", id: value.id, tabs, selectedIndex };
  }
  if (value.kind !== "split" || (value.direction !== "row" && value.direction !== "column")) {
    return null;
  }
  const first = sanitizeNode(value.first);
  const second = sanitizeNode(value.second);
  if (!first || !second || typeof value.ratio !== "number" || !Number.isFinite(value.ratio)) {
    return null;
  }
  const split: PaneNode = {
    kind: "split",
    id: value.id,
    direction: value.direction,
    ratio: 0.5,
    first,
    second,
  };
  return setSplitRatio(split, value.id, value.ratio);
}

function sanitizeWorkspace(value: unknown): Workspace | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  const root = sanitizeNode(value.root);
  if (!root) return null;
  const focusedPaneId =
    typeof value.focusedPaneId === "string" && findPane(root, value.focusedPaneId)
      ? value.focusedPaneId
      : listPanes(root)[0]!.id;
  const zoomedPaneId =
    typeof value.zoomedPaneId === "string" && findPane(root, value.zoomedPaneId)
      ? value.zoomedPaneId
      : null;
  const closedTabs = Array.isArray(value.closedTabs)
    ? value.closedTabs.flatMap((tab) => sanitizeTab(tab) ?? []).slice(-CLOSED_TABS_LIMIT)
    : [];
  return { id: value.id, name: value.name, root, focusedPaneId, zoomedPaneId, closedTabs };
}

/** Reads stored layouts defensively: anything unreadable falls back to one fresh workspace. */
export function sanitizePersistedWorkspaces(persisted: unknown): WorkspaceLayoutState {
  if (!isRecord(persisted) || !Array.isArray(persisted.workspaces)) return freshLayout();
  const workspaces = persisted.workspaces.flatMap(
    (workspace) => sanitizeWorkspace(workspace) ?? [],
  );
  if (workspaces.length === 0) return freshLayout();
  const activeWorkspaceId =
    typeof persisted.activeWorkspaceId === "string" &&
    workspaces.some((workspace) => workspace.id === persisted.activeWorkspaceId)
      ? persisted.activeWorkspaceId
      : workspaces[0]!.id;
  return { workspaces, activeWorkspaceId };
}

/**
 * Takes a stored layout but keeps this tab's own view of it: the active
 * workspace and each workspace's focused and zoomed pane, where they still
 * exist. Two browser tabs share panes and tabs, never where they are looking.
 */
function keepLocalView(
  incoming: WorkspaceLayoutState,
  current: WorkspaceLayoutState,
): WorkspaceLayoutState {
  const workspaces = incoming.workspaces.map((workspace) => {
    const local = current.workspaces.find((candidate) => candidate.id === workspace.id);
    if (!local) return workspace;
    const focusedPaneId = findPane(workspace.root, local.focusedPaneId)
      ? local.focusedPaneId
      : workspace.focusedPaneId;
    const zoomedPaneId =
      local.zoomedPaneId && findPane(workspace.root, local.zoomedPaneId)
        ? local.zoomedPaneId
        : null;
    return focusedPaneId === workspace.focusedPaneId && zoomedPaneId === workspace.zoomedPaneId
      ? workspace
      : { ...workspace, focusedPaneId, zoomedPaneId };
  });
  const activeWorkspaceId = workspaces.some(
    (workspace) => workspace.id === current.activeWorkspaceId,
  )
    ? current.activeWorkspaceId
    : incoming.activeWorkspaceId;
  return { workspaces, activeWorkspaceId };
}

/** The shared part of a layout, normalized so key order never matters. */
function layoutSignature(state: unknown): string {
  return JSON.stringify(
    sanitizePersistedWorkspaces(state).workspaces.map((workspace) => [
      workspace.id,
      workspace.name,
      workspace.root,
      workspace.closedTabs,
    ]),
  );
}

/**
 * Another browser tab saved its layout: adopt it through the persisted merge,
 * which keeps this tab's view. Rehydrating never writes back, and a save that
 * only moved the other tab's focus changes no layout, so two tabs never answer
 * each other. Unreadable or other-version values are left alone rather than
 * wiping this tab's panes.
 */
export function syncWorkspacesFromStorage(event: Pick<StorageEvent, "key" | "newValue">) {
  if (event.key !== WORKSPACE_STORAGE_KEY || event.newValue === null) return;
  let stored: unknown;
  try {
    stored = JSON.parse(event.newValue);
  } catch {
    // A torn or foreign write; the next valid save from that tab syncs.
    return;
  }
  if (!isRecord(stored) || stored.version !== WORKSPACE_STORAGE_VERSION) return;
  const { state } = stored;
  if (!isRecord(state) || !Array.isArray(state.workspaces)) return;
  if (!state.workspaces.some((workspace) => sanitizeWorkspace(workspace) !== null)) return;
  if (layoutSignature(state) === layoutSignature(useWorkspaceStore.getState())) return;
  return useWorkspaceStore.persist.rehydrate();
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  persist(
    (set, get) => ({
      ...freshLayout(),

      openTarget: (target, opts) =>
        set((state) => {
          const existing = focusExisting(state, target);
          if (existing) return existing;
          return updateActive(state, (workspace) =>
            opts?.placement === "splitRight"
              ? splitWorkspace(workspace, "right", target)
              : withRoot(workspace, addTab(workspace.root, workspace.focusedPaneId, target)),
          );
        }),

      replaceTab: (paneId, from, to) =>
        set((state) => {
          const workspace = state.workspaces.find((candidate) => findPane(candidate.root, paneId));
          if (!workspace) return {};
          return replaceWorkspace(
            state,
            withRoot(workspace, replaceTab(workspace.root, paneId, from, to)),
          );
        }),

      newTab: (target) =>
        set(
          (state) =>
            focusExisting(state, target) ??
            updateActive(state, (workspace) =>
              withRoot(workspace, addTab(workspace.root, workspace.focusedPaneId, target)),
            ),
        ),

      splitFocused: (direction, tab) =>
        set((state) => {
          const existing = tab ? focusExisting(state, tab) : null;
          if (existing) return existing;
          return updateActive(state, (workspace) => splitWorkspace(workspace, direction, tab));
        }),

      splitFocusedMoving: (direction, tab) =>
        set((state) => {
          const heldElsewhere = state.workspaces.some(
            (workspace) =>
              workspace.id !== selectActiveWorkspace(state).id &&
              findTabLocation(workspace.root, tab) !== null,
          );
          return updateActive(state, (workspace) => {
            const location = findTabLocation(workspace.root, tab);
            if (!location) {
              return splitWorkspace(workspace, direction, heldElsewhere ? undefined : tab);
            }
            const focused = findPane(workspace.root, workspace.focusedPaneId);
            if (location.paneId === focused?.id && location.index === focused.selectedIndex) {
              return splitWorkspace(workspace, direction);
            }
            // Removing it can only collapse another pane: the focused one still
            // holds its selected tab.
            const { root } = removeTab(workspace.root, location.paneId, location.index);
            return splitWorkspace(withRoot(workspace, root), direction, tab);
          });
        }),

      focusPane: (paneId) =>
        set((state) => updateActive(state, (workspace) => withFocus(workspace, paneId))),

      focusDirection: (direction) =>
        set((state) =>
          updateActive(state, (workspace) => {
            const paneId = neighbourPane(workspace.root, workspace.focusedPaneId, direction);
            return paneId ? withFocus(workspace, paneId) : workspace;
          }),
        ),

      selectTab: (which) =>
        set((state) =>
          updateActive(state, (workspace) => {
            const pane = findPane(workspace.root, workspace.focusedPaneId);
            const index = pane ? pickIndex(which, pane.selectedIndex, pane.tabs.length) : null;
            return pane && index !== null
              ? withRoot(workspace, selectTabAt(workspace.root, pane.id, index))
              : workspace;
          }),
        ),

      closeTab: (paneId, index) => set((state) => closeTabIn(state, paneId, index, true)),

      dismissTab: (paneId, index) => set((state) => closeTabIn(state, paneId, index, false)),

      dismissEverywhere: (tab) => {
        const { workspaces } = get();
        const next = workspaces.map((workspace) => {
          const open = removeEverywhere(workspace, tab);
          const closedTabs = open.closedTabs.filter((closed) => !samePaneTab(closed, tab));
          return closedTabs.length === open.closedTabs.length ? open : { ...open, closedTabs };
        });
        // Skips the save when no workspace holds the tab.
        if (next.some((workspace, index) => workspace !== workspaces[index])) {
          set({ workspaces: next });
        }
      },

      reopenClosedTab: () =>
        set((state) => {
          const workspace = selectActiveWorkspace(state);
          const tab = workspace.closedTabs.at(-1);
          if (!tab) return {};
          const next: WorkspaceLayoutState = {
            ...replaceWorkspace(state, {
              ...workspace,
              closedTabs: workspace.closedTabs.slice(0, -1),
            }),
            activeWorkspaceId: state.activeWorkspaceId,
          };
          return (
            focusExisting(next, tab) ?? {
              ...next,
              ...updateActive(next, (current) =>
                withRoot(current, addTab(current.root, current.focusedPaneId, tab)),
              ),
            }
          );
        }),

      closeOtherTabs: () =>
        set((state) =>
          updateActive(state, (workspace) => {
            const pane = findPane(workspace.root, workspace.focusedPaneId);
            const keep = pane ? selectedTab(pane) : null;
            if (!pane || !keep || pane.tabs.length < 2) return workspace;
            const closed = pane.tabs.filter((tab) => !samePaneTab(tab, keep));
            const root = replacePaneTabs(workspace.root, pane.id, [keep]);
            return {
              ...withRoot(workspace, root),
              closedTabs: pushClosed(workspace.closedTabs, closed),
            };
          }),
        ),

      moveTab: (direction) =>
        set((state) =>
          updateActive(state, (workspace) => {
            const pane = findPane(workspace.root, workspace.focusedPaneId);
            const tab = pane ? selectedTab(pane) : null;
            if (!pane || !tab) return workspace;
            const targetPaneId =
              direction === "previousPane" || direction === "nextPane"
                ? adjacentPaneInOrder(workspace.root, pane.id, direction === "nextPane" ? 1 : -1)
                : neighbourPane(workspace.root, pane.id, direction);
            if (!targetPaneId) return workspace;
            const root = moveTab(workspace.root, pane.id, pane.selectedIndex, targetPaneId);
            return withFocus(withRoot(workspace, root, targetPaneId), targetPaneId);
          }),
        ),

      reorderTab: (delta) =>
        set((state) =>
          updateActive(state, (workspace) =>
            withRoot(workspace, reorderTab(workspace.root, workspace.focusedPaneId, delta)),
          ),
        ),

      toggleZoom: () =>
        set((state) =>
          updateActive(state, (workspace) => ({
            ...workspace,
            zoomedPaneId:
              workspace.zoomedPaneId || workspace.root.kind === "pane"
                ? null
                : workspace.focusedPaneId,
          })),
        ),

      equalize: () =>
        set((state) =>
          updateActive(state, (workspace) => withRoot(workspace, equalize(workspace.root))),
        ),

      resizeFocused: (direction, stepPx, container) =>
        set((state) =>
          updateActive(state, (workspace) =>
            withRoot(
              workspace,
              resizePane(workspace.root, workspace.focusedPaneId, direction, stepPx, container),
            ),
          ),
        ),

      setRatio: (splitId, ratio) =>
        set((state) =>
          updateActive(state, (workspace) =>
            withRoot(workspace, setSplitRatio(workspace.root, splitId, ratio)),
          ),
        ),

      createWorkspace: (opts) =>
        set((state) => {
          // A seed already open elsewhere moves into the new workspace rather than appearing twice.
          const workspaces = opts?.seed
            ? state.workspaces.map((workspace) => removeEverywhere(workspace, opts.seed!))
            : state.workspaces;
          const requested = opts?.name?.trim();
          const name = requested
            ? uniqueWorkspaceName(workspaces, requested)
            : nextWorkspaceName(workspaces);
          const workspace = createWorkspaceRecord(name, opts?.seed ? [opts.seed] : []);
          return { workspaces: [...workspaces, workspace], activeWorkspaceId: workspace.id };
        }),

      selectWorkspace: (which) =>
        set((state) => {
          if (typeof which === "object") {
            return state.workspaces.some((workspace) => workspace.id === which.id)
              ? { activeWorkspaceId: which.id }
              : {};
          }
          const current = state.workspaces.findIndex(
            (workspace) => workspace.id === state.activeWorkspaceId,
          );
          const index = pickIndex(which, Math.max(current, 0), state.workspaces.length);
          return index === null ? {} : { activeWorkspaceId: state.workspaces[index]!.id };
        }),

      renameWorkspace: (id, name) =>
        set((state) => {
          const trimmed = name.trim();
          const workspace = state.workspaces.find((candidate) => candidate.id === id);
          return workspace && trimmed
            ? replaceWorkspace(state, { ...workspace, name: trimmed })
            : {};
        }),

      closeWorkspace: (id) =>
        set((state) => {
          const index = state.workspaces.findIndex((workspace) => workspace.id === id);
          if (index === -1) return {};
          const workspaces = state.workspaces.filter((workspace) => workspace.id !== id);
          if (workspaces.length === 0) return freshLayout();
          const activeWorkspaceId =
            state.activeWorkspaceId === id
              ? workspaces[Math.min(index, workspaces.length - 1)]!.id
              : state.activeWorkspaceId;
          return { workspaces, activeWorkspaceId };
        }),

      restoreWorkspace: (closed, index) =>
        set((state) => {
          if (state.workspaces.some((workspace) => workspace.id === closed.id)) return {};
          // One tab per thread: anything reopened elsewhere since the close stays there.
          const openElsewhere = state.workspaces.flatMap((workspace) =>
            listPanes(workspace.root).flatMap((pane) => pane.tabs),
          );
          const restored = openElsewhere.reduce(removeEverywhere, closed);
          // Closing the last workspace left a blank stand-in; the restore replaces it.
          const [only] = state.workspaces;
          const blankStandIn =
            state.workspaces.length === 1 && only?.root.kind === "pane" && !only.root.tabs.length;
          const workspaces = blankStandIn ? [] : [...state.workspaces];
          workspaces.splice(Math.min(Math.max(index, 0), workspaces.length), 0, restored);
          return { workspaces, activeWorkspaceId: restored.id };
        }),
    }),
    {
      name: WORKSPACE_STORAGE_KEY,
      version: WORKSPACE_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state): WorkspaceLayoutState => ({
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
      migrate: (persisted) => sanitizePersistedWorkspaces(persisted),
      // Same-version data skips `migrate`, so it is sanitized here as well.
      merge: (persisted, current) => ({
        ...current,
        ...keepLocalView(sanitizePersistedWorkspaces(persisted), current),
      }),
    },
  ),
);

function replacePaneTabs(root: PaneNode, paneId: PaneId, tabs: readonly PaneTab[]): PaneNode {
  if (root.kind === "pane") return root.id === paneId ? { ...root, tabs, selectedIndex: 0 } : root;
  const first = replacePaneTabs(root.first, paneId, tabs);
  const second = replacePaneTabs(root.second, paneId, tabs);
  return first === root.first && second === root.second ? root : { ...root, first, second };
}

function removeEverywhere(workspace: Workspace, tab: PaneTab): Workspace {
  const location = findTabLocation(workspace.root, tab);
  if (!location) return workspace;
  const { root, collapsedInto } = removeTab(workspace.root, location.paneId, location.index);
  const focusedPaneId =
    collapsedInto && workspace.focusedPaneId === location.paneId
      ? collapsedInto
      : workspace.focusedPaneId;
  return withRoot(workspace, root, focusedPaneId);
}

// Lives as long as the store, not a mounted view: a tab parked on Settings
// must still learn about the other tab's panes before it writes its own.
if (typeof window !== "undefined") {
  const onStorage = (event: StorageEvent) => void syncWorkspacesFromStorage(event);
  window.addEventListener("storage", onStorage);
  import.meta.hot?.dispose(() => window.removeEventListener("storage", onStorage));
}

// The one place a draft's tab closes by itself (a pane's view never closes a
// draft it cannot find, since another browser tab may hold it). A draft this
// tab's own store drops (deleted, or promoted and finalized) closes wherever
// it is open and leaves the reopen lists, so the close survives a reload and
// reaches other browser tabs through the layout sync. Promotion swaps the
// draft's tab for its thread before finalizing it, so a tab still holding a
// dropped draft has nothing left to become. Another browser tab's drafts never
// pass through this store, so they are never closed here.
const stopDismissingDroppedDrafts = useComposerDraftStore.subscribe((state, previous) => {
  if (state.draftThreadsByThreadKey === previous.draftThreadsByThreadKey) return;
  for (const draftId of Object.keys(previous.draftThreadsByThreadKey)) {
    if (state.draftThreadsByThreadKey[draftId] === undefined) {
      useWorkspaceStore
        .getState()
        .dismissEverywhere({ kind: "draft", draftId: DraftId.make(draftId) });
    }
  }
});
import.meta.hot?.dispose(stopDismissingDroppedDrafts);
