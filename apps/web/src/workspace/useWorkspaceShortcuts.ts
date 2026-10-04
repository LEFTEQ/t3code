import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  type ScopedProjectRef,
  TAB_SELECT_KEYBINDING_COMMANDS,
  WORKSPACE_SELECT_KEYBINDING_COMMANDS,
  type WorkspaceKeybindingCommand,
} from "@t3tools/contracts";
import { type RefObject, useEffect, useEffectEvent } from "react";

import { isCommandPaletteOpen, openCommandPalette } from "../commandPaletteBus";
import { toastManager } from "../components/ui/toast";
import { useComposerDraftStore } from "../composerDraftStore";
import { type useNewThreadHandler, useHandleNewThread } from "../hooks/useHandleNewThread";
import {
  isWorkspaceCommand,
  resolveShortcutCommand,
  setWorkspaceShortcutsActive,
} from "../keybindings";
import { isEditableFocused } from "../lib/editableFocus";
import { isPreviewFocused } from "../lib/previewFocus";
import { getTerminalFocusOwner } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { readProject, readThreadShell } from "../state/entities";
import { primaryServerKeybindingsAtom } from "../state/server";
import { findTabLocation } from "./paneTree";
import { selectActiveWorkspace, selectFocusedTab, useWorkspaceStore } from "./workspaceStore";

/** Workspace commands the store cannot run on its own; their UI owner subscribes. */
export type WorkspaceUiCommand = Extract<
  WorkspaceKeybindingCommand,
  "tab.rename" | "workspace.rename" | "attention.jumpLatest" | "attention.list"
>;

const uiCommandListeners = new Set<(command: WorkspaceUiCommand) => void>();

/**
 * Subscribes to workspace commands that need UI: "tab.rename" (the focused
 * pane's tab strip renames its selected tab), "workspace.rename" (the sidebar
 * renames the active workspace), "attention.jumpLatest" (focus the latest tab
 * waiting on the user) and "attention.list" (open the list of waiting tabs).
 * Returns the unsubscribe function.
 */
export function onWorkspaceUiCommand(listener: (command: WorkspaceUiCommand) => void): () => void {
  uiCommandListeners.add(listener);
  return () => {
    uiCommandListeners.delete(listener);
  };
}

/** cmux's default pane resize step. */
export const PANE_RESIZE_STEP_PX = 20;

const REPEATABLE_COMMANDS: ReadonlySet<WorkspaceKeybindingCommand> = new Set([
  "pane.resizeLeft",
  "pane.resizeDown",
  "pane.resizeUp",
  "pane.resizeRight",
  "tab.previous",
  "tab.next",
  "workspace.previous",
  "workspace.next",
]);

type WorkspaceStore = ReturnType<typeof useWorkspaceStore.getState>;

export interface WorkspaceCommandEnvironment {
  /** The pane tree's size in pixels, for keyboard resizing. */
  readonly containerSize: () => { width: number; height: number } | null;
  /** Opens a fresh draft for the focused tab's project, as a tab or in a new split. */
  readonly openNewTab: (split?: "right" | "down") => void;
  /** Opens a new workspace seeded with a fresh draft for the focused tab's project. */
  readonly openNewWorkspace: () => void;
  readonly emit: (command: WorkspaceUiCommand) => void;
}

function selectionIndex(commands: ReadonlyArray<string>, command: string): number | "last" | null {
  const index = commands.indexOf(command);
  if (index === -1) return null;
  return index === commands.length - 1 ? "last" : index;
}

/** Runs one workspace command against the store. */
export function runWorkspaceCommand(
  command: WorkspaceKeybindingCommand,
  store: WorkspaceStore,
  environment: WorkspaceCommandEnvironment,
): void {
  const tabChoice = selectionIndex(TAB_SELECT_KEYBINDING_COMMANDS, command);
  if (tabChoice !== null) return store.selectTab(tabChoice);
  const workspaceChoice = selectionIndex(WORKSPACE_SELECT_KEYBINDING_COMMANDS, command);
  if (workspaceChoice !== null) return store.selectWorkspace(workspaceChoice);

  const resize = (direction: "left" | "right" | "up" | "down") => {
    const container = environment.containerSize();
    if (container) store.resizeFocused(direction, PANE_RESIZE_STEP_PX, container);
  };

  switch (command) {
    case "workspace.splitRight":
      return environment.openNewTab("right");
    case "workspace.splitDown":
      return environment.openNewTab("down");
    case "pane.focusLeft":
      return store.focusDirection("left");
    case "pane.focusRight":
      return store.focusDirection("right");
    case "pane.focusUp":
      return store.focusDirection("up");
    case "pane.focusDown":
      return store.focusDirection("down");
    case "pane.zoom":
      return store.toggleZoom();
    case "pane.equalize":
      return store.equalize();
    case "pane.resizeLeft":
      return resize("left");
    case "pane.resizeDown":
      return resize("down");
    case "pane.resizeUp":
      return resize("up");
    case "pane.resizeRight":
      return resize("right");
    case "tab.new":
      return environment.openNewTab();
    case "tab.close":
      return store.closeTab();
    case "tab.reopen":
      return store.reopenClosedTab();
    case "tab.closeOthers":
      return store.closeOtherTabs();
    case "tab.previous":
      return store.selectTab("previous");
    case "tab.next":
      return store.selectTab("next");
    case "tab.moveLeft":
      return store.moveTab("left");
    case "tab.moveRight":
      return store.moveTab("right");
    case "tab.moveUp":
      return store.moveTab("up");
    case "tab.moveDown":
      return store.moveTab("down");
    case "tab.movePreviousPane":
      return store.moveTab("previousPane");
    case "tab.moveNextPane":
      return store.moveTab("nextPane");
    case "tab.reorderLeft":
      return store.reorderTab(-1);
    case "tab.reorderRight":
      return store.reorderTab(1);
    case "workspace.new":
      return environment.openNewWorkspace();
    case "workspace.previous":
      return store.selectWorkspace("previous");
    case "workspace.next":
      return store.selectWorkspace("next");
    case "workspace.close":
      return closeWorkspaceWithUndo(selectActiveWorkspace(store).id);
    case "workspace.switcher":
      return openCommandPalette({ open: "workspaces" });
    case "tab.rename":
    case "workspace.rename":
    case "attention.jumpLatest":
    case "attention.list":
      return environment.emit(command);
  }
}

function emitWorkspaceUiCommand(command: WorkspaceUiCommand): void {
  for (const listener of uiCommandListeners) listener(command);
}

/** Closes a workspace and offers Undo; its threads stay reachable from All threads either way. */
export function closeWorkspaceWithUndo(id: string): void {
  const { workspaces, closeWorkspace } = useWorkspaceStore.getState();
  const index = workspaces.findIndex((workspace) => workspace.id === id);
  const closed = workspaces[index];
  if (!closed) return;
  closeWorkspace(id);
  const toastId = toastManager.add({
    type: "success",
    title: `Closed ${closed.name}`,
    actionProps: {
      children: "Undo",
      onClick: () => {
        toastManager.close(toastId);
        useWorkspaceStore.getState().restoreWorkspace(closed, index);
      },
    },
  });
}

/**
 * ⌘N: a new workspace named after the focused tab's project, seeded with that
 * project's fresh draft so the workspace never sits empty. A project keeps one
 * empty draft, so a draft already open elsewhere moves into the new workspace.
 * With no project to inherit it opens a blank "Workspace N".
 */
export async function openSeededWorkspace(input: {
  readonly projectRef: ScopedProjectRef | null;
  readonly projectName: string | undefined;
  readonly handleNewThread: ReturnType<typeof useNewThreadHandler>;
}): Promise<void> {
  const { projectRef, projectName, handleNewThread } = input;
  if (!projectRef) return useWorkspaceStore.getState().createWorkspace();
  let presented = false;
  const opened = await handleNewThread(projectRef, {
    present: (target) => {
      presented = true;
      useWorkspaceStore.getState().createWorkspace({ name: projectName, seed: target });
    },
  });
  if (presented) return;
  // The draft was already the focused tab, so nothing was presented.
  useWorkspaceStore
    .getState()
    .createWorkspace(
      opened
        ? { name: projectName, seed: { kind: "draft", draftId: opened.draftId } }
        : { name: projectName },
    );
}

let mountedEnvironment: WorkspaceCommandEnvironment | null = null;

/**
 * Runs a workspace command the way its shortcut would — for the command
 * palette and pane-bar buttons. False while no workspace host is mounted.
 */
export function dispatchWorkspaceCommand(command: WorkspaceKeybindingCommand): boolean {
  if (!mountedEnvironment) return false;
  runWorkspaceCommand(command, useWorkspaceStore.getState(), mountedEnvironment);
  return true;
}

function workspaceShortcutContext(target: EventTarget | null) {
  return {
    terminalFocus: getTerminalFocusOwner() !== null,
    previewFocus: isPreviewFocused(),
    editableFocus: isEditableFocused(target),
    modelPickerOpen: isModelPickerOpen(),
  };
}

/** The project of the focused pane's selected tab, if it has one. */
function focusedTabProjectRef(): ScopedProjectRef | null {
  const tab = selectFocusedTab(useWorkspaceStore.getState());
  if (tab?.kind === "server") {
    const shell = readThreadShell(tab.threadRef);
    return shell ? scopeProjectRef(shell.environmentId, shell.projectId) : null;
  }
  if (tab?.kind === "draft") {
    const draft = useComposerDraftStore.getState().getDraftSession(tab.draftId);
    return draft ? scopeProjectRef(draft.environmentId, draft.projectId) : null;
  }
  return null;
}

function isRichTextComposerTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-composer-rich-text="true"]') !== null;
}

/**
 * The workspace's one keyboard dispatcher, mounted once by the workspace host
 * with a ref to the pane tree's container. It owns every pane, tab and
 * workspace command and runs it against the focused pane through
 * `useWorkspaceStore`. While mounted it sets `workspaceOpen` for every
 * shortcut resolution in the app, so the panel, terminal and chat handlers
 * stand down on these chords.
 *
 * It listens on window in the capture phase, ahead of focused editors: pane,
 * tab and workspace chords win over composer text selection. ⌘I stays italic
 * inside the rich-text composer, the same exception ⌘B bold has.
 */
export function useWorkspaceShortcuts(containerRef: RefObject<HTMLElement | null>): void {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const newThreadContext = useHandleNewThread();

  // ⌘T opens a draft for the focused tab's project; with no project to
  // inherit, the palette asks which one. A split does the same into a new
  // pane, like cmux opening a fresh surface, and only inherits the focused
  // tab's project: from an empty pane it splits off another empty pane.
  const openNewTab = useEffectEvent((split?: "right" | "down") => {
    // Read from the store, not the route: a pane-bar click focuses its pane
    // a moment before the URL catches up.
    const projectRef =
      focusedTabProjectRef() ?? (split ? null : newThreadContext.defaultProjectRef);
    if (!projectRef) {
      if (split) useWorkspaceStore.getState().splitFocused(split);
      else openCommandPalette({ open: "new-thread-in" });
      return;
    }
    // The presenter is the only placement: a reused draft already open
    // somewhere is focused there instead of opening twice. A project keeps
    // one empty draft, so a split whose draft is already on screen opens empty.
    void newThreadContext.handleNewThread(projectRef, {
      present: (target) => {
        const store = useWorkspaceStore.getState();
        if (!split) return store.openTarget(target);
        const shown = store.workspaces.some(
          (workspace) => findTabLocation(workspace.root, target) !== null,
        );
        store.splitFocused(split, shown ? undefined : target);
      },
    });
  });

  const openNewWorkspace = useEffectEvent(() => {
    const projectRef = focusedTabProjectRef() ?? newThreadContext.defaultProjectRef;
    void openSeededWorkspace({
      projectRef,
      projectName: projectRef ? readProject(projectRef)?.title : undefined,
      handleNewThread: newThreadContext.handleNewThread,
    });
  });

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || isCommandPaletteOpen()) return;
    if (event.target instanceof Element && event.target.closest("[data-keybinding-capture]")) {
      return;
    }
    const command = resolveShortcutCommand(event, keybindings, {
      context: workspaceShortcutContext(event.target),
    });
    if (!isWorkspaceCommand(command)) return;
    if (command === "attention.list" && isRichTextComposerTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.repeat && !REPEATABLE_COMMANDS.has(command)) return;
    dispatchWorkspaceCommand(command);
  });

  useEffect(() => {
    mountedEnvironment = {
      containerSize: () => {
        const rect = containerRef.current?.getBoundingClientRect();
        return rect ? { width: rect.width, height: rect.height } : null;
      },
      openNewTab: (split) => openNewTab(split),
      openNewWorkspace: () => openNewWorkspace(),
      emit: emitWorkspaceUiCommand,
    };
    setWorkspaceShortcutsActive(true);
    const handler = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      setWorkspaceShortcutsActive(false);
      mountedEnvironment = null;
    };
  }, [containerRef]);
}
