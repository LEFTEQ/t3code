import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { FolderGit2Icon, FolderGitIcon, FolderIcon, ScaleIcon } from "lucide-react";
import { type Ref, memo, useImperativeHandle, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { useProject, useThreadShell, useThreadShellsForProjectRefs } from "../state/entities";
import {
  type EnvMode,
  type EnvironmentOption,
  resolveCurrentWorkspaceLabel,
  resolveEnvModeLabel,
  resolveLockedWorkspaceLabel,
  resolvePreviousWorktreeLabel,
  resolvePreviousWorktreeSeed,
  shouldShowEnvironmentIndicator,
} from "./BranchToolbar.logic";
import {
  BranchToolbarBranchSelector,
  type BranchToolbarBranchSelectorHandle,
} from "./BranchToolbarBranchSelector";
import { PreviousWorktreeItemContent } from "./PreviousWorktreeItemContent";
import { ComposerControl } from "./chat/ComposerControl";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import { MiddleTruncate } from "./ui/middle-truncate";
import { ComposerSurface, useComposerMetadataSlot } from "./chat/ComposerSurface";
import { useComposerMenuProps } from "./chat/composerEventScope";
import { usePaneContext } from "../workspace/paneContext";

export interface BranchToolbarHandle {
  openBranchPicker: () => void;
  usePreviousWorktree: () => void;
}

interface BranchToolbarProps {
  forceNewWorktree?: boolean;
  ref?: Ref<BranchToolbarHandle>;
  environmentId: EnvironmentId;
  threadId: ThreadId;
  showGitControls: boolean;
  draftId?: DraftId;
  onEnvModeChange: (mode: EnvMode) => void;
  /** The thread's env mode as ChatView resolves it. */
  envMode: EnvMode;
  activeThreadBranchOverride?: string | null;
  onActiveThreadBranchOverrideChange?: (branch: string | null) => void;
  startFromOrigin: boolean;
  onStartFromOriginChange: (startFromOrigin: boolean) => void;
  autoEnvironmentLabel?: string | undefined;
  onAutoEnvironment?: (() => void) | undefined;
  envLocked: boolean;
  onCheckoutPullRequestRequest?: (reference: string) => void;
  onComposerFocusRequest?: () => void;
  availableEnvironments?: readonly EnvironmentOption[];
  onEnvironmentChange?: (environmentId: EnvironmentId) => void;
  /** No longer used: the composer has no resting strip to host its controls. */
  composerControlsHostRef?: (element: HTMLDivElement | null) => void;
  /** No longer used: the toolbar renders into the composer's metadata line. */
  contextStripVisible?: boolean;
}

interface RunContextSelectorProps {
  forceNewWorktree: boolean;
  autoEnvironmentLabel?: string | undefined;
  onAutoEnvironment?: (() => void) | undefined;
  envLocked: boolean;
  envModeLocked: boolean;
  environmentId: EnvironmentId;
  availableEnvironments: readonly EnvironmentOption[] | undefined;
  showEnvironmentPicker: boolean;
  showEnvironmentIndicator: boolean;
  showGitControls: boolean;
  onEnvironmentChange: ((environmentId: EnvironmentId) => void) | undefined;
  effectiveEnvMode: EnvMode;
  activeWorktreePath: string | null;
  onEnvModeChange: (mode: EnvMode) => void;
  previousWorktreeLabel: string | null;
  previousWorktreeBranch: string | null;
  onUsePreviousWorktree: () => void;
}

/**
 * Where the thread runs: the host and the workspace (local checkout or a
 * worktree), as one metadata segment opening one menu.
 */
const RunContextSelector = memo(function RunContextSelector({
  forceNewWorktree,
  autoEnvironmentLabel,
  onAutoEnvironment,
  envLocked,
  envModeLocked,
  environmentId,
  availableEnvironments,
  showEnvironmentPicker,
  showEnvironmentIndicator,
  showGitControls,
  onEnvironmentChange,
  effectiveEnvMode,
  activeWorktreePath,
  onEnvModeChange,
  previousWorktreeLabel,
  previousWorktreeBranch,
  onUsePreviousWorktree,
}: RunContextSelectorProps) {
  const composerFloatingLayerProps = useComposerMenuProps();
  const activeEnvironment = useMemo(
    () => availableEnvironments?.find((env) => env.environmentId === environmentId) ?? null,
    [availableEnvironments, environmentId],
  );
  const WorkspaceIcon =
    effectiveEnvMode === "worktree"
      ? FolderGit2Icon
      : activeWorktreePath
        ? FolderGitIcon
        : FolderIcon;
  const workspaceLabel = forceNewWorktree
    ? resolveEnvModeLabel("worktree")
    : envModeLocked
      ? resolveLockedWorkspaceLabel(activeWorktreePath, effectiveEnvMode)
      : effectiveEnvMode === "worktree"
        ? resolveEnvModeLabel("worktree")
        : resolveCurrentWorkspaceLabel(activeWorktreePath);
  const hostLabel = showEnvironmentIndicator
    ? (autoEnvironmentLabel ?? activeEnvironment?.label ?? "Run on")
    : null;
  const showsWorkspace =
    showGitControls && (effectiveEnvMode === "worktree" || activeWorktreePath !== null);
  const isLocked = (!showEnvironmentPicker || envLocked) && (!showGitControls || envModeLocked);
  const triggerContent = (
    <>
      {hostLabel !== null ? (
        autoEnvironmentLabel ? (
          <ScaleIcon aria-hidden="true" />
        ) : (
          <EnvironmentMachineIcon kind={activeEnvironment?.machine ?? "server"} />
        )
      ) : null}
      {hostLabel !== null ? <span className="min-w-0 truncate">{hostLabel}</span> : null}
      {hostLabel === null || showsWorkspace ? (
        <>
          <WorkspaceIcon aria-hidden="true" />
          <span className="min-w-0 truncate">{workspaceLabel}</span>
        </>
      ) : null}
    </>
  );

  if (isLocked) {
    return (
      <span className="inline-flex h-(--chat-meta-leading) min-w-0 items-center gap-1 px-0.5 text-chat-meta text-muted-foreground [&_svg]:size-3 [&_svg]:shrink-0">
        {triggerContent}
      </span>
    );
  }

  return (
    <Menu>
      <MenuTrigger
        render={<ComposerControl size="xs" />}
        className="min-w-0 justify-start"
        data-composer-shortcut={[
          showEnvironmentPicker && !envLocked ? "composer.host" : "",
          showGitControls && !envModeLocked ? "composer.workspace" : "",
        ].join(" ")}
      >
        {triggerContent}
      </MenuTrigger>
      <MenuPopup
        align="start"
        side="top"
        className={previousWorktreeLabel ? "w-[min(21rem,calc(100vw-2rem))]" : undefined}
        {...composerFloatingLayerProps}
      >
        {showEnvironmentPicker && availableEnvironments && onEnvironmentChange ? (
          <>
            <MenuGroup>
              <MenuGroupLabel>Run on</MenuGroupLabel>
              <MenuRadioGroup
                value={autoEnvironmentLabel ? "auto" : environmentId}
                onValueChange={(value) =>
                  value === "auto"
                    ? onAutoEnvironment?.()
                    : onEnvironmentChange(value as EnvironmentId)
                }
              >
                {onAutoEnvironment && (
                  <MenuRadioItem
                    value="auto"
                    disabled={envLocked}
                    closeOnClick
                    onClick={() => {
                      if (autoEnvironmentLabel) onAutoEnvironment?.();
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ScaleIcon className="size-3" aria-hidden="true" />
                      <span className="min-w-0 truncate">
                        {autoEnvironmentLabel ?? "Auto balance"}
                      </span>
                    </span>
                  </MenuRadioItem>
                )}
                {availableEnvironments.map((env) => (
                  <MenuRadioItem
                    key={env.environmentId}
                    disabled={envLocked}
                    value={env.environmentId}
                    closeOnClick
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <EnvironmentMachineIcon kind={env.machine} className="size-3" />
                      <span className="min-w-0 truncate">{env.label}</span>
                    </span>
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuGroup>
            {showGitControls ? <MenuSeparator /> : null}
          </>
        ) : null}
        {showGitControls ? (
          <MenuGroup>
            <MenuGroupLabel>Workspace</MenuGroupLabel>
            <MenuRadioGroup
              value={effectiveEnvMode}
              onValueChange={(value) => {
                if (value === "previous-worktree") {
                  onUsePreviousWorktree();
                  return;
                }
                onEnvModeChange(value as EnvMode);
              }}
            >
              <MenuRadioItem
                disabled={envModeLocked || forceNewWorktree}
                value="local"
                closeOnClick
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {activeWorktreePath ? (
                    <FolderGitIcon className="size-3" />
                  ) : (
                    <FolderIcon className="size-3" />
                  )}
                  <MiddleTruncate value={resolveCurrentWorkspaceLabel(activeWorktreePath)} />
                </span>
              </MenuRadioItem>
              <MenuRadioItem disabled={envModeLocked} value="worktree" closeOnClick>
                <span className="flex min-w-0 items-center gap-1.5">
                  <FolderGit2Icon className="size-3" />
                  <span className="min-w-0 truncate">{resolveEnvModeLabel("worktree")}</span>
                </span>
              </MenuRadioItem>
              {previousWorktreeLabel ? (
                <MenuRadioItem disabled={envModeLocked} value="previous-worktree" closeOnClick>
                  <PreviousWorktreeItemContent branch={previousWorktreeBranch} />
                </MenuRadioItem>
              ) : null}
            </MenuRadioGroup>
          </MenuGroup>
        ) : null}
      </MenuPopup>
    </Menu>
  );
});

/**
 * The thread's workspace controls — where it runs and on which branch — as
 * segments of the composer's metadata line. The chat view mounts this beside
 * the composer; it portals into the line the composer publishes through
 * `ComposerSurface.Shell`. Like every metadata segment, a control at its
 * default (the primary host, the local checkout, the branch a pane's tab
 * already shows) stays an invisible anchor reachable by shortcut and ⋯.
 */
export const BranchToolbar = memo(function BranchToolbar({
  forceNewWorktree = false,
  ref,
  environmentId,
  threadId,
  showGitControls,
  draftId,
  onEnvModeChange,
  envMode,
  activeThreadBranchOverride,
  onActiveThreadBranchOverrideChange,
  startFromOrigin,
  onStartFromOriginChange,
  autoEnvironmentLabel,
  onAutoEnvironment,
  envLocked,
  onCheckoutPullRequestRequest,
  onComposerFocusRequest,
  availableEnvironments,
  onEnvironmentChange,
}: BranchToolbarProps) {
  const branchSelectorRef = useRef<BranchToolbarBranchSelectorHandle>(null);
  const metadataSlot = useComposerMetadataSlot();
  const inPane = usePaneContext().paneId !== null;
  const threadRef = useMemo(
    () => scopeThreadRef(environmentId, threadId),
    [environmentId, threadId],
  );
  const draftThread = useComposerDraftStore((store) =>
    draftId ? store.getDraftSession(draftId) : store.getDraftThreadByRef(threadRef),
  );
  const serverThread = useThreadShell(threadRef);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const activeProjectRef = serverThread
    ? scopeProjectRef(serverThread.environmentId, serverThread.projectId)
    : draftThread
      ? scopeProjectRef(draftThread.environmentId, draftThread.projectId)
      : null;
  const activeProject = useProject(activeProjectRef);
  const hasActiveThread = serverThread !== null || draftThread !== null;
  const activeWorktreePath = forceNewWorktree
    ? null
    : (serverThread?.worktreePath ?? draftThread?.worktreePath ?? null);
  const effectiveEnvMode = forceNewWorktree ? "worktree" : envMode;
  const envModeLocked = envLocked || (serverThread !== null && activeWorktreePath !== null);

  // "Previous worktree" hops a draft into the most recently active worktree
  // of this project — the "keep going where I just was" follow-up flow. Only
  // drafts can hop; started server threads have their workspace pinned.
  const canUsePreviousWorktree =
    draftThread !== null && serverThread === null && !envModeLocked && !forceNewWorktree;
  const projectRefsForWorktreeLookup = useMemo(
    () => (canUsePreviousWorktree && activeProjectRef ? [activeProjectRef] : []),
    [canUsePreviousWorktree, activeProjectRef],
  );
  const projectThreads = useThreadShellsForProjectRefs(projectRefsForWorktreeLookup);
  const previousWorktreeSeed = useMemo(
    () =>
      canUsePreviousWorktree
        ? resolvePreviousWorktreeSeed({
            threads: projectThreads,
            currentWorktreePath: activeWorktreePath,
          })
        : null,
    [activeWorktreePath, canUsePreviousWorktree, projectThreads],
  );
  const previousWorktreeLabel = previousWorktreeSeed
    ? resolvePreviousWorktreeLabel(previousWorktreeSeed)
    : null;
  const onUsePreviousWorktree = useCallback(() => {
    if (!previousWorktreeSeed || !activeProjectRef) return;
    // Same shape the branch selector writes when picking a branch that
    // already lives in a worktree: point the draft at the existing tree.
    setDraftThreadContext(draftId ?? threadRef, {
      branch: previousWorktreeSeed.branch,
      worktreePath: previousWorktreeSeed.worktreePath,
      envMode: "worktree",
      projectRef: activeProjectRef,
    });
  }, [activeProjectRef, draftId, previousWorktreeSeed, setDraftThreadContext, threadRef]);

  useImperativeHandle(
    ref,
    () => ({
      openBranchPicker: () => branchSelectorRef.current?.open(),
      usePreviousWorktree: () => {
        if (!showGitControls || !canUsePreviousWorktree || !previousWorktreeSeed) return;
        onUsePreviousWorktree();
        onComposerFocusRequest?.();
      },
    }),
    [
      canUsePreviousWorktree,
      onComposerFocusRequest,
      onUsePreviousWorktree,
      previousWorktreeSeed,
      showGitControls,
    ],
  );

  const showEnvironmentPicker = Boolean(
    availableEnvironments && availableEnvironments.length > 1 && onEnvironmentChange,
  );
  const activeEnvironmentOption =
    availableEnvironments?.find((env) => env.environmentId === environmentId) ?? null;
  const showEnvironmentIndicator = shouldShowEnvironmentIndicator({
    activeEnvironment: activeEnvironmentOption,
    canPickEnvironment: showEnvironmentPicker,
  });

  if (!hasActiveThread || !activeProject || !metadataSlot?.element) return null;

  const otherHost =
    autoEnvironmentLabel !== undefined ||
    (activeEnvironmentOption !== null && !activeEnvironmentOption.isPrimary);
  const worktree =
    showGitControls && (effectiveEnvMode === "worktree" || activeWorktreePath !== null);
  const hasRunContext = showGitControls || showEnvironmentIndicator;

  return createPortal(
    <>
      {hasRunContext ? (
        <ComposerSurface.Segment
          segment={otherHost ? "host" : "worktree"}
          hidden={!otherHost && !worktree}
        >
          <RunContextSelector
            forceNewWorktree={forceNewWorktree}
            autoEnvironmentLabel={autoEnvironmentLabel}
            onAutoEnvironment={onAutoEnvironment}
            envLocked={envLocked}
            envModeLocked={envModeLocked}
            environmentId={environmentId}
            availableEnvironments={availableEnvironments}
            showEnvironmentPicker={showEnvironmentPicker}
            showEnvironmentIndicator={otherHost}
            showGitControls={showGitControls}
            onEnvironmentChange={onEnvironmentChange}
            effectiveEnvMode={effectiveEnvMode}
            activeWorktreePath={activeWorktreePath}
            onEnvModeChange={onEnvModeChange}
            previousWorktreeLabel={previousWorktreeLabel}
            previousWorktreeBranch={previousWorktreeSeed?.branch ?? null}
            onUsePreviousWorktree={onUsePreviousWorktree}
          />
        </ComposerSurface.Segment>
      ) : null}
      {showGitControls ? (
        <ComposerSurface.Segment segment="branch" hidden={inPane}>
          <BranchToolbarBranchSelector
            forceNewWorktree={forceNewWorktree}
            ref={branchSelectorRef}
            className="min-w-0"
            environmentId={environmentId}
            threadId={threadId}
            {...(draftId ? { draftId } : {})}
            envLocked={envLocked}
            effectiveEnvModeOverride={effectiveEnvMode}
            {...(activeThreadBranchOverride !== undefined ? { activeThreadBranchOverride } : {})}
            {...(onActiveThreadBranchOverrideChange ? { onActiveThreadBranchOverrideChange } : {})}
            startFromOrigin={startFromOrigin}
            onStartFromOriginChange={onStartFromOriginChange}
            {...(onCheckoutPullRequestRequest ? { onCheckoutPullRequestRequest } : {})}
            {...(onComposerFocusRequest ? { onComposerFocusRequest } : {})}
          />
        </ComposerSurface.Segment>
      ) : null}
    </>,
    metadataSlot.element,
  );
});
