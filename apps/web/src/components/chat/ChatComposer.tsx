import { DESKTOP_PASTE_AS_TEXT_EVENT } from "../../lib/desktopPasteAsText";
import { isLocalEnvironmentDisabled } from "../../localEnvironment";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { runtimeModeConfig, runtimeModeOptions } from "./runtimeModeConfig";
import { useRightPanelStore } from "~/rightPanelStore";
import { AttachmentFilePreview } from "../files/AttachmentFilePreview";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { filterComposerPullRequestMatches } from "@t3tools/shared/composerPullRequestMatches";
import { importPastedComposerText, readPastedComposerContext } from "../composerInlineTokenPaste";
import { elementContextToPreviewAnnotation } from "../../lib/elementContext";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import {
  questionAttachmentDraftId,
  countQuestionAttachments,
  useQuestionAttachmentPreparation,
  changeQuestionAttachmentPreparation,
} from "../../questionAttachments";
import type {
  ApprovalRequestId,
  KeybindingCommand,
  AssistantCitation,
  ChatFileAttachment,
  EnvironmentId,
  ModelSelection,
  ProjectId,
  PullRequestListInput,
  PreviewAnnotationPayload,
  ProviderApprovalDecision,
  ProviderInteractionMode,
  ResolvedKeybindingsConfig,
  RuntimeMode,
  ScopedThreadRef,
  ServerProvider,
  ThreadId,
  SnapShotSource,
} from "@t3tools/contracts";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
} from "@t3tools/contracts";
import type { EnvironmentConnectionPresentation } from "@t3tools/client-runtime/connection";
import {
  isPasteAsTextShortcut,
  nextPastedTextFileName,
  pastedTextDisposition,
  wouldTextPasteExceedLimit,
} from "@t3tools/client-runtime/text-paste";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { folderDropTarget, resolveDroppedFolderPath } from "./folderDrop";
import { createModelSelection, normalizeModelSlug } from "@t3tools/shared/model";
import { USAGE_LIMITS_COMMAND } from "@t3tools/shared/usageLimits";
import {
  memo,
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  clampCollapsedComposerCursor,
  type ComposerSubmissionIntent,
  type ComposerTrigger,
  collapseExpandedComposerCursor,
  composerStateAtPromptEnd,
  composerSubmissionIntentForEnter,
  detectComposerTrigger,
  expandCollapsedComposerCursor,
  formatAssistantCitationForComposer,
  replaceTextRange,
} from "../../composer-logic";
import { DISCONNECTED_COMPOSER_PLACEHOLDER } from "../../composerPlaceholder";
import { listContinuationForEnter, listIndentForTab } from "../../composer-list-continuation";
import {
  deriveComposerSendState,
  getAntigravitySendBlockReason,
  readFileAsDataUrl,
  resolveComposerInteractionMode,
  resolveComposerProviderSelection,
} from "../ChatView.logic";
import {
  dataTransferHasComposerMention,
  makeComposerMentionDragHandlers,
} from "./composerMentionDrag";
import { composerFloatingLayerProps, useComposerMenuProps } from "./composerEventScope";
import {
  type ComposerFileAttachment,
  type ComposerImageAttachment,
  type DraftId,
  type PersistedComposerFileAttachment,
  type PersistedComposerImageAttachment,
  composerFileDedupKey,
  composerFileMatchesReattachMarker,
  composerFileNeedsReattach,
  composerTargetKey,
  hydrateImagesFromPersisted,
  useComposerDraftStore,
  useComposerThreadDraft,
  useEffectiveComposerModelState,
} from "../../composerDraftStore";
import {
  MAX_STASH_ENTRIES,
  partitionStashAttachments,
  usePromptStashStore,
  type PromptStashEntry,
} from "../../promptStashStore";
import { ComposerStashBadge } from "./ComposerStashBadge";
import { ComposerStashMenu } from "./ComposerStashMenu";
import { useComposerMenuState } from "./useComposerMenuState";
import { useComposerTriggerState } from "./useComposerTriggerState";
import {
  ComposerTasksBadge,
  ComposerTasksContent,
  ComposerTasksDrawer,
  type ComposerTaskStep,
  type ComposerTasksProgress,
} from "./ComposerTasksBadge";
import { ComposerActivityRow } from "./ComposerActivityStatus";
import {
  reconcileAttachmentContextReferences,
  type RetainedAttachmentContextPayloads,
} from "./composerContextUndo";
import type { ThreadSyncPhase } from "../../threadSync";
import { ComposerBanner } from "./ComposerBanner";
import { ComposerSurface, useComposerMetadataSlot } from "./ComposerSurface";
import {
  ComposerBannerStack,
  type ComposerBannerStackContent,
  type ComposerBannerStackItem,
} from "./ComposerBannerStack";
import { compressImageForStash, prepareImageForAttachment } from "../../lib/imageCompression";
import {
  fileAttachmentTooLargeMessage,
  formatAttachmentSize,
} from "@t3tools/client-runtime/state/attachments";
import {
  attachmentsToReleaseOnUploadCapabilityLoss,
  composerOtherFilesForPresentation,
  classifyComposerAttachmentFile,
  fileAttachmentCapabilityBlockReason,
  fileAttachmentStagingLimit,
  isPreviewableComposerVideo,
  normalizeComposerImageFileMimeType,
  shouldHandleComposerAttachmentPaste,
} from "./composerAttachmentFiles";
import {
  readAttachmentUpload,
  releaseAttachmentUpload,
  releaseDraftAttachment,
  releasePersistedAttachmentUpload,
  retryAttachmentUpload,
  startAttachmentUpload,
  useAttachmentUploadStore,
  verifyStashedAttachmentUpload,
} from "../../lib/attachmentUploadQueue";
import {
  attachmentUploadBlockReason,
  formatAttachmentUploadProgress,
} from "../../lib/attachmentUploadState";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { getTerminalFocusOwner } from "../../lib/terminalFocus";
import type { AssistantCitationSourceAnchor } from "~/lib/assistantTextSelection";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../../keybindings";
import {
  type TerminalContextDraft,
  type TerminalContextSelection,
} from "../../lib/terminalContext";
import { useComposerPathSearch } from "../../lib/composerPathSearchState";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import { type ComposerPromptEditorHandle, ComposerPromptEditor } from "../ComposerPromptEditor";
import {
  ComposerContextActionsContext,
  composerContextRecordsFromDraft,
  uploadedContextRecordFromDraft,
} from "../composerContextPresentation";
import { useOpenPrLink } from "~/lib/openPullRequestLink";
import {
  collectInlineContextIds,
  stripInlineContextReferences,
  type ComposerContextReference,
  ensureInlineContextReferences,
  formatInlineContextReference,
  insertInlineContextReference,
  inlineContextReferenceReplacement,
  toKindScopedComposerContextId,
} from "~/lib/composerContextReferences";
import {
  asKnownContextRecord,
  composerContextImportLookupIds,
  isSameComposerContextPayload,
  uploadedAttachmentContextRecord,
  fileContextReference,
  imageContextReference,
  previewAnnotationContextId,
  previewAnnotationContextRecord,
  previewAnnotationFromRecord,
  reviewCommentContextId,
  reviewCommentContextReference,
  reviewCommentContextRecord,
  reviewCommentFromRecord,
  terminalContextDraftFromRecord,
  terminalContextReference,
  terminalContextRecord,
} from "~/lib/composerContextRecords";
import { requestConfirmDialog } from "~/confirmDialog";
import { encodeComposerContextFragment } from "@t3tools/shared/composerContextClipboard";
import type { ComposerContextClipboardFragment, ComposerContextRecord } from "@t3tools/contracts";
import { resolveAssetUrl } from "~/assets/assetUrls";
import { assetEnvironment } from "~/state/assets";
import { readPreparedConnection } from "~/state/session";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import {
  pullRequestEnvironment,
  usePullRequestList,
  type EnvironmentQueryTarget,
} from "~/state/pullRequests";
import { useEnvironmentQuery } from "~/state/query";
import { useDebouncedValue } from "~/state/queries";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { resolveModelPickerSelectedModel } from "./ModelPickerContent";
import { type ComposerCommandItem, ComposerCommandMenu } from "./ComposerCommandMenu";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import { CompactComposerControlsMenu } from "./CompactComposerControlsMenu";
import { ComposerImageThumbnail } from "./ComposerImageThumbnail";
import { ComposerPrimaryActions } from "./ComposerPrimaryActions";
import { ComposerPendingApprovalPanel } from "./ComposerPendingApprovalPanel";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import { ComposerPlanFollowUpBanner } from "./ComposerPlanFollowUpBanner";
import { ComposerControl, ComposerControlIcon, ComposerSelectControl } from "./ComposerControl";
import { resolveComposerMenuActiveItemId } from "./composerMenuHighlight";
import { buildPullRequestReferenceContext } from "../pullRequest/pullRequestDetail.logic";
import {
  matchesPullRequestQuery,
  rankPullRequestMatches,
} from "../pullRequest/pullRequestList.logic";
import {
  searchSlashCommandItems,
  slashCommandItemsForPromptPosition,
} from "./composerSlashCommandSearch";
import {
  getComposerPromptInjectionState,
  getComposerProviderState,
  renderProviderTraitsMenuContent,
  renderProviderTraitsPicker,
} from "./composerProviderState";
import {
  buildAttachmentVideoPreview,
  buildExpandedImagePreview,
  type ExpandedImagePreview,
} from "./ExpandedImagePreview";
import {
  SNAP_SHOT_ATTACHMENT_FRAME_CLASS,
  SnapShotAttachmentDetails,
} from "./SnapShotAttachmentDetails";
import {
  getPendingSnapShotAnimations,
  pendingSnapShotAnimationIdsForTarget,
  scheduleSnapShotAnimationDestination,
  setSnapShotAnimationDestination,
  shouldAnimateSnapShotArrival,
  subscribeToPendingSnapShotAnimations,
} from "../../lib/snapShotAnimation";
import { resizeSnapShotSource } from "../../lib/snapShotSource";
import { basenameOfPath } from "../../pierre-icons";
import { cn, isMacPlatform, randomUUID } from "~/lib/utils";
import {
  getComposerPromptLengthValidationMessage,
  getComposerSubmissionValidationMessage,
  submitComposerDraft,
} from "./composerSubmission";
import { ComposerPromptLengthValidation } from "./ComposerPromptLengthValidation";
import { PierreEntryIcon } from "./PierreEntryIcon";
import { pendingDraftWork } from "./pendingDraftWork";
import { ChatGutterRow } from "./ChatGutter";
import { resolveComposerMetadataSegments } from "./composerMetadata";
import type { ComposerMenuLauncher } from "./CompactComposerControlsMenu";
import { usePaneContext } from "../../workspace/paneContext";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useProject } from "../../state/entities";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { getProviderOptionCurrentValue, getProviderOptionDescriptors } from "@t3tools/shared/model";
import { getProviderModelCapabilities } from "../../providerModels";

type ComposerCommandMenuPosition = {
  bottom: number;
  left: number;
  maxHeight: number;
  width: number;
};

function SnapShotAttachmentFrame({
  animationId,
  animationSource,
  arrival,
  animateArrival,
  className,
  ...props
}: ComponentProps<"div"> & {
  readonly animationId?: string | undefined;
  readonly animationSource?: SnapShotSource | undefined;
  readonly arrival?: boolean | undefined;
  readonly animateArrival?: boolean | undefined;
}) {
  const frameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || (!animationId && !arrival)) return;
    frame.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (!animationId) return;

    return scheduleSnapShotAnimationDestination(animationId, () =>
      setSnapShotAnimationDestination(animationId, frame, animationSource),
    );
  }, [animationId, animationSource, arrival]);

  return (
    <div
      ref={frameRef}
      className={cn(
        animateArrival &&
          !animationId &&
          "origin-center transition-[opacity,scale] duration-300 ease-drawer starting:scale-95 starting:opacity-0 motion-reduce:transition-none motion-reduce:starting:scale-100 motion-reduce:starting:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

/**
 * One attachment above the prompt: a borderless 20px chip — preview icon, name,
 * a status word — whose × keeps a 24px hit area. Snap-shot captures keep their
 * own larger frame.
 */
function ComposerAttachmentChip(props: {
  icon: ReactNode;
  name: string;
  detail: ReactNode;
  openLabel: string;
  onOpen: (() => void) | null;
  notPersisted?: boolean | undefined;
  retry?: { readonly reason: string; readonly onRetry: () => void } | null | undefined;
  onRemove: () => void;
}) {
  return (
    <div className="flex h-5 max-w-64 min-w-0 shrink-0 items-center gap-1 rounded-sm bg-muted ps-1 text-chat-meta text-foreground">
      <button
        type="button"
        disabled={props.onOpen === null}
        className="flex min-w-0 cursor-zoom-in items-center gap-1 outline-none focus-visible:underline disabled:cursor-default"
        aria-label={props.openLabel}
        onClick={() => props.onOpen?.()}
      >
        <span className="flex size-3.5 shrink-0 items-center justify-center overflow-hidden rounded-xs">
          {props.icon}
        </span>
        <span className="min-w-0 truncate">{props.name}</span>
      </button>
      {props.notPersisted ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                role="img"
                aria-label="Draft attachment may not persist"
                className="inline-flex shrink-0 text-warning-foreground"
              >
                <CircleAlertIcon className="size-3" />
              </span>
            }
          />
          <TooltipPopup side="top">
            Draft attachment could not be saved locally and may be lost on navigation.
          </TooltipPopup>
        </Tooltip>
      ) : null}
      {props.detail !== null ? (
        <span className="shrink-0 text-muted-foreground tabular-nums">{props.detail}</span>
      ) : null}
      {props.retry ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="relative flex size-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground outline-none after:absolute after:-inset-1 hover:text-foreground focus-visible:text-foreground"
                onClick={props.retry.onRetry}
                aria-label={`Retry upload for ${props.name}`}
              />
            }
          >
            <RefreshIcon className="size-3" />
          </TooltipTrigger>
          <TooltipPopup side="top">{props.retry.reason}</TooltipPopup>
        </Tooltip>
      ) : null}
      <button
        type="button"
        className="relative flex size-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground outline-none after:absolute after:-inset-1 hover:text-foreground focus-visible:text-foreground"
        onClick={props.onRemove}
        aria-label={`Remove ${props.name}`}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

// Workspace controls the branch toolbar keeps on the metadata line; at their
// default they are invisible anchors that the ⋯ menu opens by shortcut.
const COMPOSER_ANCHORED_CONTROL_LAUNCHERS = [
  ["composer.workspace", "Workspace…"],
  ["composer.host", "Run on…"],
  ["composer.branch", "Branch…"],
] as const satisfies ReadonlyArray<readonly [KeybindingCommand, string]>;

const COMPOSER_PULL_REQUEST_LIST_LIMIT = 99;
const COMPOSER_PULL_REQUEST_RESULT_LIMIT = 12;
const EMPTY_PULL_REQUEST_LIST_TARGETS: ReadonlyArray<EnvironmentQueryTarget<PullRequestListInput>> =
  [];

function composerCommandMenuPositionsEqual(
  a: ComposerCommandMenuPosition,
  b: ComposerCommandMenuPosition,
): boolean {
  return (
    a.bottom === b.bottom && a.left === b.left && a.maxHeight === b.maxHeight && a.width === b.width
  );
}

function ComposerCommandMenuLayer(props: { anchor: HTMLElement | null; children: ReactNode }) {
  const [position, setPosition] = useState<ComposerCommandMenuPosition | null>(null);

  useLayoutEffect(() => {
    const anchor = props.anchor;
    if (!anchor) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const form = anchor.closest<HTMLElement>('[data-chat-composer-form="true"]');
      const mainSurface = form?.querySelector<HTMLElement>(
        '[data-chat-composer-main-surface="true"]',
      );
      // The menu sits on the prompt line's rule, across the composer's width.
      const rect = (mainSurface ?? form ?? anchor).getBoundingClientRect();
      const next = {
        bottom: window.innerHeight - rect.top,
        left: rect.left,
        maxHeight: Math.max(96, rect.top - 24),
        width: Math.max(0, rect.width),
      };
      setPosition((current) =>
        current && composerCommandMenuPositionsEqual(current, next) ? current : next,
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (observer) {
      // The composer is centered and capped at a max width, so opening a side
      // panel slides it sideways without ever resizing it. Watching the anchor
      // alone would leave the menu behind; the ancestors are what shrink, and
      // they resize on every frame of the panel animation.
      observer.observe(anchor);
      for (let element = anchor.parentElement; element; element = element.parentElement) {
        observer.observe(element);
      }
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [props.anchor]);

  if (!position) return null;

  return createPortal(
    <div
      className="pointer-events-auto fixed z-40 flex flex-col"
      data-composer-drawer-layer="true"
      style={{
        bottom: position.bottom,
        left: position.left,
        maxHeight: position.maxHeight,
        width: position.width,
      }}
    >
      {props.children}
    </div>,
    document.body,
  );
}
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectValue } from "../ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import {
  FileIcon,
  CircleAlertIcon,
  PencilRulerIcon,
  PlayIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { proposedPlanTitle } from "../../proposedPlan";
import { hasProviderSetup } from "./ProviderStatusBanner";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  NO_PROVIDER_MODEL_SELECTION,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { type AppModelOption, getAppModelOptionsForInstance } from "../../modelSelection";
import type { UnifiedSettings } from "@t3tools/contracts/settings";
import {
  isVideoAttachment,
  type ChatMessage,
  type SessionPhase,
  type Thread,
  type ThreadShell,
  videoMimeType,
} from "../../types";
import {
  buildComposerPromptHistoryEntries,
  stepComposerPromptHistory,
  type ComposerPromptHistoryPosition,
} from "./composerPromptHistory";
import type { PendingUserInputDraftAnswer } from "../../pendingUserInput";
import type { PendingApproval, PendingUserInput } from "../../session-logic";
import {
  formatProviderSkillDisplayName,
  getProviderSlashCommandsForSlashMenu,
  getProviderSkillsForSlashMenu,
  resolveProviderSkillsForCwd,
  resolveProviderSlashCommandsForCwd,
} from "@t3tools/client-runtime/providerSkills";
import { searchProviderSkills } from "../../providerSkillSearch";
import { useDelayedStatus } from "../../hooks/useDelayedStatus";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useAtomCommand } from "../../state/use-atom-command";
import { serverEnvironment } from "../../state/server";
import type { ReviewCommentContext } from "../../reviewCommentContext";

const WORKSPACE_SNAPSHOT_RETRY_COOLDOWN_MS = 10_000;

const extendReplacementRangeForTrailingSpace = (
  text: string,
  rangeEnd: number,
  replacement: string,
): number => {
  if (!replacement.endsWith(" ")) {
    return rangeEnd;
  }
  return text[rangeEnd] === " " ? rangeEnd + 1 : rangeEnd;
};

/** The access (runtime) mode as a metadata segment: a select that keeps the composer.mode shortcut. */
const ComposerAccessControl = memo(function ComposerAccessControl(props: {
  runtimeMode: RuntimeMode;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}) {
  const composerFloatingLayerProps = useComposerMenuProps();
  const [open, setOpen] = useComposerMenuState();
  const runtimeModeOption = runtimeModeConfig[props.runtimeMode];
  const RuntimeModeIcon = runtimeModeOption.icon;

  return (
    <Select
      open={open}
      onOpenChange={setOpen}
      value={props.runtimeMode}
      onValueChange={(value) => props.onRuntimeModeChange(value!)}
    >
      <ComposerSelectControl
        data-composer-shortcut="composer.mode"
        size="xs"
        aria-label={`Access: ${runtimeModeOption.label}`}
      >
        <ComposerControlIcon icon={RuntimeModeIcon} size="xs" />
        <SelectValue>{runtimeModeOption.label}</SelectValue>
      </ComposerSelectControl>
      <SelectPopup alignItemWithTrigger={false} {...composerFloatingLayerProps}>
        {runtimeModeOptions.map((mode) => {
          const option = runtimeModeConfig[mode];
          const OptionIcon = option.icon;
          return (
            <SelectItem key={mode} value={mode} hideIndicator className="min-w-64">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <OptionIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    {option.label}
                  </span>
                  <span className="text-muted-foreground text-xs leading-4">
                    {option.description}
                  </span>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectPopup>
    </Select>
  );
});

/** Plan mode as a metadata segment; it only shows while plan mode is on, and clicking it leaves. */
const ComposerPlanToggle = memo(function ComposerPlanToggle(props: { onToggle: () => void }) {
  return (
    <ComposerControl
      size="xs"
      aria-pressed
      aria-label="Plan mode — click to return to build mode"
      onClick={props.onToggle}
    >
      <ComposerControlIcon icon={PencilRulerIcon} size="xs" />
      Plan
    </ComposerControl>
  );
});

// --------------------------------------------------------------------------
// Handle exposed to ChatView
// --------------------------------------------------------------------------

export interface ChatComposerHandle {
  focusAtEnd: () => void;
  focusAt: (cursor: number) => void;
  addDroppedFiles: (files: File[]) => void;
  addDroppedFolders: (folders: File[]) => void;
  hasPendingAttachments: () => boolean;
  insertTextAtEnd: (
    text: string,
    options?: { ensureLeadingBoundary?: boolean; clipboardData?: DataTransfer },
  ) => boolean;
  /** Apply large-paste folding for text redirected from a blurred composer. */
  pasteTextAtEnd: (text: string, options?: { bypassAutoAttachment?: boolean }) => boolean;
  citeAssistantText: (
    citation: AssistantCitation,
    sourceAnchor: AssistantCitationSourceAnchor,
  ) => boolean;
  openModelPicker: () => void;
  toggleModelPicker: () => void;
  openControl: (command: KeybindingCommand) => void;
  isModelPickerOpen: () => boolean;
  compactContext: () => void;
  readSnapshot: () => {
    value: string;
    cursor: number;
    expandedCursor: number;
    contextIds: string[];
  };
  /** Reset composer cursor/trigger/highlight after external prompt mutations (e.g. onSend). */
  resetCursorState: (options?: {
    cursor?: number;
    prompt?: string;
    detectTrigger?: boolean;
  }) => void;
  /** Insert a terminal context from the terminal drawer. */
  addTerminalContext: (selection: TerminalContextSelection) => void;
  /** Get the current prompt/effort/model state for use in send. */
  getSendContext: () => {
    prompt: string;
    images: ComposerImageAttachment[];
    files: ComposerFileAttachment[];
    terminalContexts: TerminalContextDraft[];
    previewAnnotations: PreviewAnnotationPayload[];
    reviewComments: ReviewCommentContext[];
    selectedPromptEffort: string | null;
    selectedModelOptionsForDispatch: unknown;
    selectedModelSelection: ModelSelection;
    multipleModelSelections: ReadonlyArray<ModelSelection> | null;
    providerAvailable: boolean;
    selectedProvider: ProviderDriverKind;
    selectedModel: string;
    selectedProviderModels: ReadonlyArray<ServerProvider["models"][number]>;
    interactionMode: ProviderInteractionMode;
    interactionModeEnabled: boolean;
  };
  /** Validate the fully composed text immediately before a provider turn starts. */
  validateProviderInput: (providerInput: string) => boolean;
  setMultipleModelSelections: (selections: ReadonlyArray<ModelSelection>) => void;
}

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

export interface ChatComposerProps {
  composerDraftTarget: ScopedThreadRef | DraftId;
  environmentId: EnvironmentId;
  attachmentUploadsCapabilityKnown: boolean;
  supportsAttachmentUploads: boolean;
  supportsQuestionAttachments: boolean;
  maxFileAttachmentBytes: number | null;
  routeKind: "server" | "draft";
  routeThreadRef: ScopedThreadRef;
  draftId: DraftId | null;
  multipleModelSelections: ReadonlyArray<ModelSelection> | null;
  supportsMultipleModels: boolean;
  onMultipleModelSelectionsChange: React.Dispatch<
    React.SetStateAction<ReadonlyArray<ModelSelection> | null>
  >;

  // Thread context
  activeThreadId: ThreadId | null;
  activeThreadEnvironmentId: EnvironmentId | undefined;
  activeThread: Thread | undefined;
  /** The routed server thread's shell, present before its detail loads. */
  activeThreadShell: ThreadShell | null;
  /** Timeline messages including optimistic sends, for ArrowUp prompt recall. */
  promptHistoryMessages: ReadonlyArray<ChatMessage>;
  isServerThread: boolean;
  isLocalDraftThread: boolean;
  projectSelectionRequired: boolean;

  // Session phase
  phase: SessionPhase;
  isConnecting: boolean;
  isSendBusy: boolean;
  isRevertingCheckpoint?: boolean;
  sendDisabledReason: string | null;
  isPreparingWorktree: boolean;
  bannerItems: readonly ComposerBannerStackItem[];
  /** Picking /usage-limits from the menu is the action itself; the draft keeps nothing of it. */
  onUsageLimitsCommand?: (() => void) | undefined;
  environmentUnavailable: {
    readonly label: string;
    readonly connection: EnvironmentConnectionPresentation;
  } | null;

  // Pending approvals / inputs
  activePendingApproval: PendingApproval | null;
  pendingApprovals: PendingApproval[];
  pendingUserInputs: PendingUserInput[];
  activePendingProgress: {
    questionIndex: number;
    isLastQuestion: boolean;
    canAdvance: boolean;
    customAnswer: string;
    activeQuestion: {
      id: string;
      multiSelect?: boolean | undefined;
      allowCustomAnswer?: boolean | undefined;
    } | null;
  } | null;
  activePendingResolvedAnswers: Record<string, unknown> | null;
  activePendingIsResponding: boolean;
  activePendingDraftAnswers: Record<string, PendingUserInputDraftAnswer>;
  activePendingQuestionIndex: number;
  respondingRequestIds: ApprovalRequestId[];

  // Plan
  showPlanFollowUpPrompt: boolean;
  activeProposedPlan: Thread["proposedPlans"][number] | null;
  activeTasksProgress: ComposerTasksProgress | null;
  activeTaskSteps: readonly ComposerTaskStep[] | null;
  threadSyncPhase: ThreadSyncPhase | null;

  // Mode
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;

  // Provider / model
  lockedProvider: ProviderDriverKind | null;
  providerStatuses: ServerProvider[];
  /** False until the environment's server config has arrived at least once. */
  providerCatalogKnown: boolean;
  activeProjectDefaultModelSelection: ModelSelection | null | undefined;
  activeThreadModelSelection: ModelSelection | null | undefined;

  // Context window
  compactThreadUnavailable: boolean;
  compactDisabled: boolean;

  // Misc
  resolvedTheme: "light" | "dark";
  settings: UnifiedSettings;
  keybindings: ResolvedKeybindingsConfig;
  terminalOpen: boolean;
  gitCwd: string | null;
  pullRequestProjectId: ProjectId | null;
  pullRequestRepository: string | null;

  // Refs the parent needs kept in sync
  promptRef: React.RefObject<string>;
  composerImagesRef: React.RefObject<ComposerImageAttachment[]>;
  composerFilesRef: React.RefObject<ComposerFileAttachment[]>;
  composerTerminalContextsRef: React.RefObject<TerminalContextDraft[]>;
  composerRef: React.RefObject<ChatComposerHandle | null>;
  onPageScrollKeyDown: (key: "PageUp" | "PageDown") => void;
  onPageScrollKeyUp: (key: string) => void;
  onPageScrollRelease: () => void;

  // Callbacks
  onCompactContext: () => void;
  onSend: (e?: { preventDefault: () => void }, intent?: ComposerSubmissionIntent) => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
  onSelectActivePendingUserInputOption: (questionId: string, optionValue: string) => void;
  onAdvanceActivePendingUserInput: () => void;
  onDismissActivePendingUserInput: (requestId: ApprovalRequestId) => void;
  onPreviousActivePendingUserInputQuestion: () => void;
  onChangeActivePendingUserInputCustomAnswer: (
    questionId: string,
    value: string,
    nextCursor: number,
    expandedCursor: number,
    cursorAdjacentToMention: boolean,
  ) => void;

  onProviderModelSelect: (
    instanceId: ProviderInstanceId,
    model: string,
    options?: { focusComposer?: boolean },
  ) => void;
  onOpenProviderSetup: (instanceId: ProviderInstanceId) => void;
  getModelDisabledReason: (instanceId: ProviderInstanceId, model: string) => string | null;
  toggleInteractionMode: () => void;
  handleRuntimeModeChange: (mode: RuntimeMode) => void;
  handleInteractionModeChange: (mode: ProviderInteractionMode) => void;

  focusComposer: () => void;
  scheduleComposerFocus: () => void;
  setThreadError: (threadId: ThreadId | null, error: string | null) => void;
  onExpandImage: (preview: ExpandedImagePreview) => void;
  onFileOpen: (attachment: ChatFileAttachment) => void;
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export const ChatComposer = memo(function ChatComposer(props: ChatComposerProps) {
  const {
    composerDraftTarget,
    environmentId,
    attachmentUploadsCapabilityKnown,
    supportsAttachmentUploads,
    supportsQuestionAttachments,
    maxFileAttachmentBytes,
    routeKind,
    routeThreadRef,
    draftId,
    multipleModelSelections,
    supportsMultipleModels,
    onMultipleModelSelectionsChange: setMultipleModelSelections,
    activeThreadId,
    activeThreadEnvironmentId: _activeThreadEnvironmentId,
    activeThread,
    promptHistoryMessages,
    isServerThread: _isServerThread,
    isLocalDraftThread: _isLocalDraftThread,
    projectSelectionRequired,
    phase,
    isConnecting,
    isSendBusy,
    isRevertingCheckpoint = false,
    sendDisabledReason: externalSendDisabledReason,
    isPreparingWorktree,
    environmentUnavailable,
    activePendingApproval,
    pendingApprovals,
    pendingUserInputs,
    activePendingProgress,
    activePendingResolvedAnswers,
    activePendingIsResponding,
    activePendingDraftAnswers,
    activePendingQuestionIndex,
    respondingRequestIds,
    showPlanFollowUpPrompt,
    activeProposedPlan,
    runtimeMode,
    interactionMode: requestedInteractionMode,
    lockedProvider,
    providerStatuses,
    providerCatalogKnown,
    activeProjectDefaultModelSelection,
    activeThreadModelSelection,
    compactThreadUnavailable,
    compactDisabled,
    resolvedTheme,
    settings,
    keybindings,
    terminalOpen,
    gitCwd,
    pullRequestProjectId,
    pullRequestRepository,
    promptRef,
    composerRef,
    composerImagesRef,
    composerFilesRef,
    composerTerminalContextsRef,
    onPageScrollKeyDown,
    onPageScrollKeyUp,
    onPageScrollRelease,
    onCompactContext,
    onSend,
    onInterrupt,
    onImplementPlanInNewThread,
    onRespondToApproval,
    onSelectActivePendingUserInputOption,
    onAdvanceActivePendingUserInput,
    onDismissActivePendingUserInput,
    onPreviousActivePendingUserInputQuestion,
    onChangeActivePendingUserInputCustomAnswer,
    onProviderModelSelect,
    onOpenProviderSetup,
    getModelDisabledReason,
    toggleInteractionMode,
    handleRuntimeModeChange,
    handleInteractionModeChange,
    focusComposer,
    scheduleComposerFocus,
    setThreadError,
    onExpandImage,
    onFileOpen,
  } = props;
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const composerDraftTargetKey = composerTargetKey(composerDraftTarget);
  // Opening a running thread resyncs for a few frames. Show the sync row, and
  // hide the tasks row for it, only when the sync lasts. Logic that depends on
  // the real phase keeps reading `props.threadSyncPhase`.
  const shownSyncPhase = useDelayedStatus(composerDraftTargetKey, props.threadSyncPhase);
  const activeTasksProgress = shownSyncPhase === null ? props.activeTasksProgress : null;
  const activeTaskSteps = shownSyncPhase === null ? props.activeTaskSteps : null;
  // ------------------------------------------------------------------
  // Store subscriptions (prompt / images / terminal contexts)
  // ------------------------------------------------------------------
  const composerDraft = useComposerThreadDraft(composerDraftTarget);
  // Live target key, for async flows that must notice a thread switch that
  // happened while they awaited.
  const composerDraftTargetKeyRef = useRef("");
  composerDraftTargetKeyRef.current = composerDraftTargetKey;
  const questionAttachmentTarget =
    pendingUserInputs[0] && activePendingProgress?.activeQuestion
      ? questionAttachmentDraftId(
          environmentId,
          activeThreadId!,
          pendingUserInputs[0].requestId,
          activePendingProgress.activeQuestion.id,
        )
      : null;
  const attachmentDraftTarget = questionAttachmentTarget ?? composerDraftTarget;
  const attachmentDraft = useComposerThreadDraft(attachmentDraftTarget);
  const attachmentTargetKey = composerTargetKey(attachmentDraftTarget);
  // An import that finishes after a draft change must compare against the draft open *now*, not
  // the one captured in the closure that started it.
  const attachmentTargetKeyRef = useRef(attachmentTargetKey);
  attachmentTargetKeyRef.current = attachmentTargetKey;
  const questionPreparations = useQuestionAttachmentPreparation((state) => state.counts);
  const prompt = composerDraft.prompt;
  const composerImages = attachmentDraft.images;
  const composerFiles = attachmentDraft.files;
  // A question answer has no chips: its files live in the question draft and show in the
  // strip. Only the thread prompt's references decide which files leave the strip.
  const inlineFileIdSet = useMemo(() => {
    if (questionAttachmentTarget) return new Set<string>();
    const contextIds = new Set(collectInlineContextIds(prompt));
    return new Set(
      composerFiles
        .filter((file) => contextIds.has(toKindScopedComposerContextId("file", file.id)))
        .map((file) => file.id),
    );
  }, [composerFiles, prompt, questionAttachmentTarget]);
  const composerVideos = composerFiles.filter((file) =>
    isPreviewableComposerVideo(file, environmentId),
  );
  const composerOtherFiles = composerOtherFilesForPresentation(
    composerFiles,
    environmentId,
    inlineFileIdSet,
  );
  const composerTerminalContexts = composerDraft.terminalContexts;
  const composerPreviewAnnotations = composerDraft.previewAnnotations;
  const composerReviewComments = composerDraft.reviewComments;
  const pendingSnapShotAnimations = useSyncExternalStore(
    subscribeToPendingSnapShotAnimations,
    getPendingSnapShotAnimations,
    getPendingSnapShotAnimations,
  );
  const pendingSnapShotIds = useMemo(
    () => pendingSnapShotAnimationIdsForTarget(pendingSnapShotAnimations, composerDraftTarget),
    [composerDraftTarget, pendingSnapShotAnimations],
  );
  const pendingSnapShotIdSet = useMemo(() => new Set(pendingSnapShotIds), [pendingSnapShotIds]);
  const uncommittedSnapShotIds = pendingSnapShotIds.filter(
    (id) => !composerImages.some((image) => image.id === id),
  );
  const standaloneComposerImages = useMemo(() => {
    const previewAnnotationIds = new Set(
      composerPreviewAnnotations.map((annotation) => annotation.id),
    );
    return composerImages.filter((image) => !previewAnnotationIds.has(image.id));
  }, [composerImages, composerPreviewAnnotations]);
  const nonPersistedComposerImageIds = attachmentDraft.nonPersistedImageIds;
  const uploadsByImageId = useAttachmentUploadStore((state) => state.uploadsByImageId);
  const openPrLink = useOpenPrLink(routeThreadRef);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const previewFile = composerFiles.find((file) => file.id === previewFileId);
  const composerContextActions = useMemo(
    () => ({
      environmentId,
      expandImage: (imageId: string) => {
        const preview = buildExpandedImagePreview(composerImages, imageId);
        if (preview) onExpandImage(preview);
      },
      openFile: setPreviewFileId,
      openMention: (path: string) => useRightPanelStore.getState().openFile(routeThreadRef, path),
      expandVideo: (fileId: string) => {
        const file = composerFiles.find((candidate) => candidate.id === fileId);
        if (!file || !isVideoAttachment(file)) return;
        const localPreview = buildExpandedImagePreview([file], file.id);
        if (localPreview) {
          onExpandImage(localPreview);
          return;
        }
        if (file.uploadedAttachmentId === undefined || file.uploadEnvironmentId !== environmentId) {
          return;
        }
        const persistedPreview = buildAttachmentVideoPreview(environmentId, {
          type: "file",
          id: file.uploadedAttachmentId,
          name: file.name,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        });
        if (persistedPreview) onExpandImage(persistedPreview);
      },
      openPullRequest: (event: React.MouseEvent<HTMLElement>, url: string) => {
        openPrLink(event, url);
      },
    }),
    [composerFiles, composerImages, environmentId, onExpandImage, openPrLink, routeThreadRef],
  );
  const composerContextRecords = useMemo(
    () =>
      composerContextRecordsFromDraft({
        terminalContexts: composerTerminalContexts,
        reviewComments: composerReviewComments,
        previewAnnotations: composerPreviewAnnotations,
        images: composerImages,
        files: composerFiles,
        uploadsByImageId,
      }),
    [
      composerFiles,
      composerImages,
      composerPreviewAnnotations,
      composerReviewComments,
      composerTerminalContexts,
      uploadsByImageId,
    ],
  );
  const needsReattachFileCount = composerFiles.filter(composerFileNeedsReattach).length;
  const fileStagingLimit = fileAttachmentStagingLimit({
    attachmentUploadsCapabilityKnown,
    supportsAttachmentUploads,
    maxFileAttachmentBytes,
  });
  const fileCapabilityBlockReason = fileAttachmentCapabilityBlockReason({
    files: composerFiles,
    attachmentUploadsCapabilityKnown,
    supportsAttachmentUploads,
    maxFileAttachmentBytes,
  });
  const attachmentBlockReason =
    (questionAttachmentTarget &&
    !supportsQuestionAttachments &&
    (composerImages.length > 0 || composerFiles.length > 0)
      ? "Update this server to send files with question answers"
      : null) ??
    fileCapabilityBlockReason ??
    (supportsAttachmentUploads
      ? needsReattachFileCount > 0
        ? needsReattachFileCount === 1
          ? "Attach the interrupted file again or remove it"
          : "Attach the interrupted files again or remove them"
        : attachmentUploadBlockReason({
            imageIds: [...composerImages, ...composerFiles].map((attachment) => attachment.id),
            uploadsByImageId,
            environmentId,
          })
      : null);
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const removeComposerDraftImage = useComposerDraftStore((store) => store.removeImage);
  const addComposerDraftFiles = useComposerDraftStore((store) => store.addFiles);
  const removeComposerDraftFile = useComposerDraftStore((store) => store.removeFile);
  const setComposerDraftFileUpload = useComposerDraftStore((store) => store.setFileUpload);
  const insertComposerDraftTerminalContext = useComposerDraftStore(
    (store) => store.insertTerminalContext,
  );
  const setComposerDraftTerminalContexts = useComposerDraftStore(
    (store) => store.setTerminalContexts,
  );
  const removeComposerDraftPreviewAnnotation = useComposerDraftStore(
    (store) => store.removePreviewAnnotation,
  );
  const removeComposerDraftReviewComment = useComposerDraftStore(
    (store) => store.removeReviewComment,
  );
  const clearComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.clearPersistedAttachments,
  );
  const clearComposerDraftTerminalContexts = useComposerDraftStore(
    (store) => store.clearTerminalContexts,
  );
  const clearComposerDraftPromptAndImages = useComposerDraftStore(
    (store) => store.clearComposerPromptAndImages,
  );
  const syncComposerDraftPersistedAttachments = useComposerDraftStore(
    (store) => store.syncPersistedAttachments,
  );
  const getComposerDraft = useComposerDraftStore((store) => store.getComposerDraft);

  useEffect(() => {
    if (!attachmentUploadsCapabilityKnown) {
      return;
    }
    if (!supportsAttachmentUploads) {
      // The capability can flap on reconnect or version skew. Deleting a
      // persisted hydrated upload here would make the next send fail
      // verification while the file still sits in the draft.
      for (const attachment of attachmentsToReleaseOnUploadCapabilityLoss([
        ...composerImages,
        ...composerFiles,
      ])) {
        releaseAttachmentUpload(attachment.id);
      }
      return;
    }
    const invalidFiles =
      maxFileAttachmentBytes === null
        ? composerFiles
        : composerFiles.filter((file) => file.sizeBytes > maxFileAttachmentBytes);
    for (const attachment of attachmentsToReleaseOnUploadCapabilityLoss(invalidFiles)) {
      releaseAttachmentUpload(attachment.id);
    }
    const uploadableFiles =
      maxFileAttachmentBytes === null
        ? []
        : composerFiles.filter((file) => file.sizeBytes <= maxFileAttachmentBytes);
    const uploadableAttachments = [...composerImages, ...uploadableFiles];
    for (const attachment of uploadableAttachments) {
      // A needs-reattach file has no bytes to upload and no upload to verify.
      if (attachment.type === "file" && composerFileNeedsReattach(attachment)) {
        continue;
      }
      startAttachmentUpload({
        environmentId,
        image: attachment,
        draftTarget: attachmentDraftTarget,
      });
    }
  }, [
    attachmentUploadsCapabilityKnown,
    attachmentDraftTarget,
    composerFiles,
    composerImages,
    environmentId,
    maxFileAttachmentBytes,
    supportsAttachmentUploads,
  ]);

  useEffect(() => {
    for (const file of composerFiles) {
      if (
        !attachmentUploadsCapabilityKnown ||
        !supportsAttachmentUploads ||
        maxFileAttachmentBytes === null ||
        file.sizeBytes > maxFileAttachmentBytes
      ) {
        continue;
      }
      const upload = uploadsByImageId[file.id];
      if (upload?.status === "ready" && upload.environmentId === environmentId) {
        setComposerDraftFileUpload(
          attachmentDraftTarget,
          file.id,
          environmentId,
          upload.attachmentId,
        );
      }
    }
  }, [
    attachmentUploadsCapabilityKnown,
    attachmentDraftTarget,
    composerFiles,
    environmentId,
    maxFileAttachmentBytes,
    setComposerDraftFileUpload,
    supportsAttachmentUploads,
    uploadsByImageId,
  ]);

  // ------------------------------------------------------------------
  // Model state
  // ------------------------------------------------------------------
  // Instance-aware projection of the wire provider list. One entry per
  // configured instance (default built-in + any custom `providerInstances.*`),
  // sorted default-first per driver kind for a stable picker order.
  const providerInstanceEntries = useMemo<ReadonlyArray<ProviderInstanceEntry>>(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(providerStatuses), settings),
      ),
    [providerStatuses, settings],
  );
  const selectedProviderByThreadId = composerDraft.activeProvider ?? null;
  const {
    selectedProviderEntry,
    requestedDriverKind,
    lockedContinuationGroupKey,
    unavailableProviderInstanceId,
  } = useMemo(
    () =>
      resolveComposerProviderSelection({
        entries: providerInstanceEntries,
        candidateInstanceIds: [
          selectedProviderByThreadId,
          activeThread?.session?.providerInstanceId,
          activeThreadModelSelection?.instanceId,
          activeProjectDefaultModelSelection?.instanceId,
        ],
        lockedProvider,
        lockedInstanceId:
          activeThread?.session?.providerInstanceId ?? activeThreadModelSelection?.instanceId,
      }),
    [
      activeProjectDefaultModelSelection?.instanceId,
      activeThread?.session?.providerInstanceId,
      activeThreadModelSelection?.instanceId,
      selectedProviderByThreadId,
      lockedProvider,
      providerInstanceEntries,
    ],
  );
  const selectedInstanceId =
    selectedProviderEntry?.instanceId ?? NO_PROVIDER_MODEL_SELECTION.instanceId;
  const noProviderAvailable =
    selectedProviderEntry === undefined && multipleModelSelections === null;
  // Before the catalog arrives, every thread resolves to "no provider". Send
  // stays blocked either way; only the chrome waits, keeping the picker with
  // the thread's own selection instead of swapping in the setup button and
  // back once the catalog lands.
  const providerCatalogPending = noProviderAvailable && !providerCatalogKnown;
  const showProviderUnavailable = noProviderAvailable && !providerCatalogPending;
  const providerSetupInstanceId = noProviderAvailable
    ? (unavailableProviderInstanceId ??
      (lockedProvider === null
        ? providerInstanceEntries.find((entry) => hasProviderSetup(entry.snapshot))?.instanceId
        : undefined))
    : undefined;
  // The driver kind follows the instance that will actually run the turn,
  // which can differ from the persisted selection when that selection is
  // disabled.
  const selectedProvider: ProviderDriverKind =
    selectedProviderEntry?.driverKind ?? requestedDriverKind;

  const { modelOptions: composerModelOptions, selectedModel } = useEffectiveComposerModelState({
    threadRef: composerDraftTarget,
    providers: providerStatuses,
    selectedProvider,
    selectedInstanceId,
    threadModelSelection: activeThreadModelSelection,
    projectModelSelection: activeProjectDefaultModelSelection,
    settings,
  });
  const providerSendBlockReason = getAntigravitySendBlockReason(
    selectedProviderEntry?.snapshot,
    selectedModel,
  );
  const sendDisabledReason =
    externalSendDisabledReason ??
    (multipleModelSelections?.length === 0 ? "Select at least one model." : null) ??
    (activePendingProgress
      ? attachmentBlockReason
      : (attachmentBlockReason ??
        (multipleModelSelections === null ? providerSendBlockReason : null)));
  const isSendDisabled = sendDisabledReason !== null;
  const selectedProviderStatus = useMemo(
    () => selectedProviderEntry?.snapshot ?? null,
    [selectedProviderEntry],
  );
  const selectedProviderSkills = selectedProviderStatus
    ? resolveProviderSkillsForCwd(selectedProviderStatus, gitCwd)
    : [];
  const selectedProviderSlashCommands = selectedProviderStatus
    ? resolveProviderSlashCommandsForCwd(selectedProviderStatus, gitCwd)
    : [];
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const workspaceRefreshKeyRef = useRef<string | null>(null);
  const workspaceRefreshRetryRef = useRef<{ key: string; notBefore: number } | null>(null);
  const hadWorkspaceSnapshotRef = useRef(false);
  useEffect(() => {
    const hasWorkspaceSnapshot = Boolean(
      gitCwd &&
      selectedProviderStatus?.workspaceSnapshots?.some((snapshot) => snapshot.cwd === gitCwd),
    );
    if (hadWorkspaceSnapshotRef.current && !hasWorkspaceSnapshot) {
      workspaceRefreshKeyRef.current = null;
      workspaceRefreshRetryRef.current = null;
    }
    hadWorkspaceSnapshotRef.current = hasWorkspaceSnapshot;
  }, [gitCwd, selectedProviderStatus]);
  useEffect(() => {
    if (!gitCwd || !selectedProviderEntry) return;
    const key = `${environmentId}:${selectedProviderEntry.instanceId}:${gitCwd}`;
    const hasWorkspaceSnapshot = selectedProviderStatus?.workspaceSnapshots?.some(
      (snapshot) => snapshot.cwd === gitCwd,
    );
    if (workspaceRefreshKeyRef.current === key) return;
    if (hasWorkspaceSnapshot) {
      workspaceRefreshKeyRef.current = key;
      workspaceRefreshRetryRef.current = null;
      return;
    }
    const retry = workspaceRefreshRetryRef.current;
    if (retry?.key === key && Date.now() < retry.notBefore) return;
    workspaceRefreshKeyRef.current = key;
    const retryLater = () => {
      if (workspaceRefreshKeyRef.current !== key) return;
      workspaceRefreshKeyRef.current = null;
      workspaceRefreshRetryRef.current = {
        key,
        notBefore: Date.now() + WORKSPACE_SNAPSHOT_RETRY_COOLDOWN_MS,
      };
    };
    void refreshProviders({
      environmentId,
      input: { instanceId: selectedProviderEntry.instanceId, cwd: gitCwd },
    }).then((result) => {
      const hasWorkspaceSnapshot =
        result._tag === "Success" &&
        result.value.providers
          .find((provider) => provider.instanceId === selectedProviderEntry.instanceId)
          ?.workspaceSnapshots?.some((snapshot) => snapshot.cwd === gitCwd);
      if (!hasWorkspaceSnapshot && workspaceRefreshKeyRef.current === key) {
        retryLater();
      }
    }, retryLater);
  }, [environmentId, gitCwd, prompt, refreshProviders, selectedProviderEntry]);
  const selectedProviderModels = useMemo<ReadonlyArray<ServerProvider["models"][number]>>(
    () => selectedProviderEntry?.models ?? [],
    [selectedProviderEntry],
  );

  const composerPromptInjectionState = useMemo(
    () => getComposerPromptInjectionState(prompt),
    [prompt],
  );
  const composerProviderState = useMemo(
    () =>
      getComposerProviderState({
        provider: selectedProvider,
        model: selectedModel,
        models: selectedProviderModels,
        promptInjectionState: composerPromptInjectionState,
        modelOptions: composerModelOptions?.[selectedInstanceId],
        planModeEnabled: settings.planModeEnabled,
      }),
    [
      composerModelOptions,
      composerPromptInjectionState,
      selectedInstanceId,
      selectedModel,
      selectedProvider,
      selectedProviderModels,
      settings.planModeEnabled,
    ],
  );

  const selectedPromptEffort = composerProviderState.promptEffort;
  const selectedModelOptionsForDispatch = composerProviderState.modelOptionsForDispatch;
  const { enabled: planModeUiEnabled, interactionMode } = resolveComposerInteractionMode({
    planModeEnabled: settings.planModeEnabled,
    provider: selectedProviderStatus,
    interactionMode: requestedInteractionMode,
  });
  const selectedModelSelection = useMemo<ModelSelection>(
    () => createModelSelection(selectedInstanceId, selectedModel, selectedModelOptionsForDispatch),
    [selectedInstanceId, selectedModel, selectedModelOptionsForDispatch],
  );
  const selectedModelForPicker = selectedModel;
  // Instance-keyed option list so the picker can show each configured
  // instance (built-in + custom) as a first-class sidebar entry. The
  // options are server-reported models plus that exact instance's
  // configured custom models. A missing OpenCode selection is included as
  // an unavailable row until the catalog reports it again.
  const modelOptionsByInstance = useMemo<
    ReadonlyMap<ProviderInstanceId, ReadonlyArray<AppModelOption>>
  >(() => {
    const out = new Map<ProviderInstanceId, ReadonlyArray<AppModelOption>>();
    for (const entry of providerInstanceEntries) {
      out.set(
        entry.instanceId,
        getAppModelOptionsForInstance(
          settings,
          entry,
          entry.instanceId === selectedInstanceId ? selectedModelForPicker : null,
        ),
      );
    }
    return out;
  }, [providerInstanceEntries, selectedInstanceId, selectedModelForPicker, settings]);
  const selectedModelForPickerWithCustomFallback = useMemo(() => {
    const currentOptions = modelOptionsByInstance.get(selectedInstanceId) ?? [];
    return currentOptions.some((option) => option.slug === selectedModelForPicker)
      ? selectedModelForPicker
      : (normalizeModelSlug(selectedModelForPicker, selectedProvider) ?? selectedModelForPicker);
  }, [modelOptionsByInstance, selectedInstanceId, selectedModelForPicker, selectedProvider]);

  // ------------------------------------------------------------------
  // Composer-local state
  // ------------------------------------------------------------------
  const [composerCursor, setComposerCursor] = useState(() =>
    collapseExpandedComposerCursor(prompt, prompt.length),
  );
  const {
    trigger: composerTrigger,
    setTrigger: setComposerTrigger,
    resolveTrigger: resolveComposerTrigger,
    dismissTrigger: dismissComposerTrigger,
    resetTrigger: resetComposerTrigger,
  } = useComposerTriggerState(() => detectComposerTrigger(prompt, prompt.length));
  const [composerHighlightedItemId, setComposerHighlightedItemId] = useState<string | null>(null);
  // Active ArrowUp recall. Cleared on edit and on thread switch.
  const promptHistoryPositionRef = useRef<ComposerPromptHistoryPosition | null>(null);
  const [composerHighlightedSearchKey, setComposerHighlightedSearchKey] = useState<string | null>(
    null,
  );
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const [isComposerModelPickerOpen, setIsComposerModelPickerOpen] = useState(false);
  const isMobileViewport = useMediaQuery("max-sm");
  const [composerSubmissionError, setComposerSubmissionError] = useState<string | null>(null);
  const [providerInputSubmissionError, setProviderInputSubmissionError] = useState<string | null>(
    null,
  );
  const [composerMenuAnchor, setComposerMenuAnchor] = useState<HTMLDivElement | null>(null);
  const [isStashMenuOpen, setIsStashMenuOpen] = useState(false);
  const [isTasksDrawerOpen, setIsTasksDrawerOpen] = useState(false);
  const [stashPulse, setStashPulse] = useState<{ key: number; active: boolean }>({
    key: 0,
    active: false,
  });

  // ------------------------------------------------------------------
  // Refs
  // ------------------------------------------------------------------
  const composerEditorRef = useRef<ComposerPromptEditorHandle>(null);
  const pasteAsTextShortcutUntilRef = useRef(0);
  const pastedTextFileNamesRef = useRef<{ targetKey: string; names: Set<string> }>({
    targetKey: "",
    names: new Set(),
  });
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const composerSurfaceRef = useRef<HTMLDivElement>(null);
  const providerInputRejectedRef = useRef(false);
  const composerSelectLockRef = useRef(false);
  const composerMenuOpenRef = useRef(false);
  const composerMenuItemsRef = useRef<ComposerCommandItem[]>([]);
  const activeComposerMenuItemRef = useRef<ComposerCommandItem | null>(null);
  const stashPulseKeyRef = useRef(0);
  const stashPulseTimeoutRef = useRef<number | null>(null);
  /**
   * Snapshots currently being encoded, keyed by target+prompt+image ids.
   * Keyed rather than boolean so a genuinely different prompt (or a different
   * thread) can still be stashed while an earlier encode is running.
   */
  const stashInFlightRef = useRef<Set<string>>(new Set());
  /**
   * Count of pasted images still being compressed, per thread. Reserved
   * against the attachment limit so concurrent pastes can't overshoot it,
   * and checked before sending so an image cannot move into
   * the next draft.
   */
  const pendingImageCompressionsRef = useRef<Map<string, number>>(new Map());
  const isRevertingCheckpointRef = useRef(isRevertingCheckpoint);
  isRevertingCheckpointRef.current = isRevertingCheckpoint;

  useEffect(() => {
    const armPasteAsTextShortcut = () => {
      // Electron can deliver its native menu action just before the paste
      // event, while browsers normally deliver keydown first. A short deadline
      // bridges both event paths without leaving later pastes in bypass mode.
      pasteAsTextShortcutUntilRef.current = Date.now() + 1_000;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof Node &&
        composerFormRef.current?.contains(event.target) &&
        isPasteAsTextShortcut(event, isMacPlatform(navigator.platform))
      ) {
        armPasteAsTextShortcut();
      }
    };
    const onBlur = () => {
      pasteAsTextShortcutUntilRef.current = 0;
    };
    const onDesktopPasteAsText = () => {
      const activeElement = document.activeElement;
      const blocksPasteToFocus =
        activeElement instanceof Element &&
        activeElement.closest(
          'input, textarea, select, button, a[href], summary, [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"], [role="button"], [role="menuitem"], [role="option"]',
        ) !== null;
      if (
        (activeElement instanceof Node && composerFormRef.current?.contains(activeElement)) ||
        !blocksPasteToFocus
      ) {
        armPasteAsTextShortcut();
      }
    };
    window.addEventListener(DESKTOP_PASTE_AS_TEXT_EVENT, onDesktopPasteAsText);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener(DESKTOP_PASTE_AS_TEXT_EVENT, onDesktopPasteAsText);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // ------------------------------------------------------------------
  // Derived: composer send state
  // ------------------------------------------------------------------
  const composerSendState = useMemo(
    () =>
      deriveComposerSendState({
        prompt,
        imageCount: composerImages.length + composerFiles.length,
        terminalContexts: composerTerminalContexts,
        elementContextCount: composerPreviewAnnotations.length + composerReviewComments.length,
      }),
    [
      composerFiles.length,
      composerImages.length,
      composerPreviewAnnotations.length,
      composerReviewComments.length,
      composerTerminalContexts,
      prompt,
    ],
  );
  // ------------------------------------------------------------------
  // Derived: composer trigger / menu
  // ------------------------------------------------------------------
  const composerTriggerKind = composerTrigger?.kind ?? null;
  const pathTriggerQuery = composerTrigger?.kind === "path" ? composerTrigger.query : "";
  const pullRequestTriggerQuery =
    composerTrigger?.kind === "pull-request" ? composerTrigger.query : "";
  const pullRequestTextQuery =
    composerTriggerKind === "pull-request" &&
    pullRequestTriggerQuery.length > 0 &&
    !/^\d+$/u.test(pullRequestTriggerQuery)
      ? pullRequestTriggerQuery
      : null;
  const debouncedPullRequestTextQuery = useDebouncedValue(pullRequestTextQuery, 180);
  const settledPullRequestTextQuery =
    pullRequestTextQuery === debouncedPullRequestTextQuery ? pullRequestTextQuery : null;
  const isPathTrigger = composerTriggerKind === "path";
  const workspaceEntries = useComposerPathSearch({
    environmentId,
    cwd: isPathTrigger ? gitCwd : null,
    query: isPathTrigger ? pathTriggerQuery : null,
  });
  const compactSlashCommandAvailable =
    composerTrigger?.kind === "slash-command" &&
    prompt.slice(0, composerTrigger.rangeStart).trim() === "" &&
    !compactThreadUnavailable &&
    prompt.slice(composerTrigger.rangeEnd).trim() === "" &&
    composerImages.length + composerFiles.length === 0 &&
    composerDraft.persistedAttachments.length === 0 &&
    composerTerminalContexts.length === 0 &&
    composerPreviewAnnotations.length === 0 &&
    composerReviewComments.length === 0;

  const pullRequestListTargets = useMemo(
    () =>
      composerTriggerKind !== "pull-request" ||
      pullRequestProjectId === null ||
      (pullRequestTextQuery !== null && settledPullRequestTextQuery === null)
        ? EMPTY_PULL_REQUEST_LIST_TARGETS
        : [
            {
              environmentId,
              input: {
                state: "all" as const,
                projectId: pullRequestProjectId,
                limit: COMPOSER_PULL_REQUEST_LIST_LIMIT,
                ...(settledPullRequestTextQuery === null
                  ? {}
                  : { query: settledPullRequestTextQuery }),
              },
            },
          ],
    [
      composerTriggerKind,
      environmentId,
      pullRequestProjectId,
      pullRequestTextQuery,
      settledPullRequestTextQuery,
    ],
  );
  const pullRequestLookup = usePullRequestList(pullRequestListTargets);
  const pullRequestTriggerNumber = useMemo(() => {
    if (composerTrigger?.kind !== "pull-request" || composerTrigger.query.length === 0) {
      return null;
    }
    const number = Number(composerTrigger.query);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  }, [composerTrigger]);
  const debouncedPullRequestNumber = useDebouncedValue(pullRequestTriggerNumber, 180);
  const settledPullRequestNumber =
    pullRequestTriggerNumber === debouncedPullRequestNumber ? pullRequestTriggerNumber : null;
  const recentHasExactPullRequest =
    settledPullRequestNumber !== null &&
    pullRequestLookup.data?.entries.some(
      (entry) =>
        entry.projectId === pullRequestProjectId &&
        entry.repository.trim().toLowerCase() === pullRequestRepository?.trim().toLowerCase() &&
        entry.number === settledPullRequestNumber,
    ) === true;
  const exactPullRequestLookup = useEnvironmentQuery(
    settledPullRequestNumber === null ||
      pullRequestProjectId === null ||
      pullRequestRepository === null ||
      recentHasExactPullRequest
      ? null
      : pullRequestEnvironment.detail({
          environmentId,
          input: {
            projectId: pullRequestProjectId,
            repository: pullRequestRepository,
            number: settledPullRequestNumber,
          },
        }),
  );

  const composerMenuItems = useMemo<ComposerCommandItem[]>(() => {
    if (!composerTrigger) return [];
    if (composerTrigger.kind === "path") {
      return workspaceEntries.entries.map((entry) => ({
        id: `path:${entry.kind}:${entry.path}`,
        type: "path",
        path: entry.path,
        pathKind: entry.kind,
        label: basenameOfPath(entry.path),
        description: entry.path.slice(0, Math.max(0, entry.path.lastIndexOf("/"))),
      }));
    }
    if (composerTrigger.kind === "slash-command") {
      const builtInSlashCommandItems = [
        {
          id: "slash:model",
          type: "slash-command",
          command: "model",
          label: "/model",
          description: "Switch response model for this thread",
        },
        ...(planModeUiEnabled
          ? ([
              {
                id: "slash:plan",
                type: "slash-command",
                command: "plan",
                label: "/plan",
                description: "Switch this thread into plan mode",
              },
              {
                id: "slash:default",
                type: "slash-command",
                command: "default",
                label: "/default",
                description: "Switch this thread back to normal build mode",
              },
            ] as const)
          : []),
      ] satisfies ReadonlyArray<Extract<ComposerCommandItem, { type: "slash-command" }>>;
      const slashMenuSkills = getProviderSkillsForSlashMenu(
        selectedProviderSkills,
        settings.showSkillsInSlashMenu,
      );
      const providerSlashCommandItems = getProviderSlashCommandsForSlashMenu(
        selectedProviderSlashCommands,
        slashMenuSkills,
      ).map((command) => ({
        id: `provider-slash-command:${selectedProvider}:${command.name}`,
        type: "provider-slash-command" as const,
        provider: selectedProvider,
        command,
        label: `/${command.name}`,
        description: command.description ?? command.input?.hint ?? "Run provider command",
      }));
      const query = composerTrigger.query.trim().toLowerCase();
      const skillItems = slashMenuSkills.map((skill) => ({
        id: `skill:${selectedProvider}:${skill.name}`,
        type: "skill" as const,
        provider: selectedProvider,
        skill,
        label: `/skill:${skill.name}`,
        description:
          skill.shortDescription ??
          skill.description ??
          (skill.scope ? `${skill.scope} skill` : ""),
      }));
      const visibleProviderSlashCommandItems = providerSlashCommandItems.filter(
        (item) => item.command.name !== "compact" || compactSlashCommandAvailable,
      );
      const slashCommandItems = slashCommandItemsForPromptPosition(
        [...builtInSlashCommandItems, ...visibleProviderSlashCommandItems, ...skillItems],
        composerTrigger.rangeStart === 0,
      );
      return searchSlashCommandItems(slashCommandItems, query);
    }
    if (composerTrigger.kind === "skill") {
      return searchProviderSkills(selectedProviderSkills, composerTrigger.query).map((skill) => ({
        id: `skill:${selectedProvider}:${skill.name}`,
        type: "skill" as const,
        provider: selectedProvider,
        skill,
        label: formatProviderSkillDisplayName(skill),
        description:
          skill.shortDescription ??
          skill.description ??
          (skill.scope ? `${skill.scope} skill` : "Run provider skill"),
      }));
    }
    if (
      composerTrigger.kind === "pull-request" &&
      pullRequestProjectId !== null &&
      pullRequestRepository !== null
    ) {
      const exactPullRequest =
        exactPullRequestLookup.data?.number === pullRequestTriggerNumber
          ? [exactPullRequestLookup.data]
          : [];
      const matches = /^\d*$/u.test(composerTrigger.query)
        ? filterComposerPullRequestMatches({
            entries: [...exactPullRequest, ...(pullRequestLookup.data?.entries ?? [])],
            projectId: pullRequestProjectId,
            repository: pullRequestRepository,
            query: composerTrigger.query,
            limit: COMPOSER_PULL_REQUEST_RESULT_LIMIT,
          })
        : rankPullRequestMatches(
            (pullRequestLookup.data?.entries ?? []).filter((entry) => {
              if (
                entry.projectId !== pullRequestProjectId ||
                entry.repository.trim().toLowerCase() !== pullRequestRepository.trim().toLowerCase()
              ) {
                return false;
              }
              const provider = pullRequestLookup.data?.providers.find(
                (candidate) => candidate.host === entry.host,
              );
              return (
                provider?.searchesOnHost === true ||
                matchesPullRequestQuery(entry, composerTrigger.query)
              );
            }),
            composerTrigger.query,
          ).slice(0, COMPOSER_PULL_REQUEST_RESULT_LIMIT);
      return matches.map((pullRequest) => ({
        id: `pull-request:${pullRequest.projectId}:${pullRequest.repository}:${pullRequest.number}`,
        type: "pull-request",
        pullRequest: {
          number: pullRequest.number,
          title: pullRequest.title,
          url: pullRequest.url,
          headBranch: pullRequest.headBranch,
          baseBranch: pullRequest.baseBranch,
          state: pullRequest.state,
          isDraft: pullRequest.isDraft,
        },
        label: `#${pullRequest.number}`,
        description: pullRequest.title,
      }));
    }
    return [];
  }, [
    compactSlashCommandAvailable,
    composerTrigger,
    exactPullRequestLookup.data,
    planModeUiEnabled,
    pullRequestLookup.data,
    pullRequestProjectId,
    pullRequestRepository,
    pullRequestTriggerNumber,
    selectedProvider,
    selectedProviderSkills,
    selectedProviderSlashCommands,
    selectedProviderStatus,
    settings.showSkillsInSlashMenu,
    workspaceEntries.entries,
  ]);

  const composerMenuOpen = Boolean(composerTrigger);
  const composerMenuSearchKey = composerTrigger
    ? `${composerTrigger.kind}:${composerTrigger.query.trim().toLowerCase()}`
    : null;
  const activeComposerMenuItem = useMemo(() => {
    const activeItemId = resolveComposerMenuActiveItemId({
      items: composerMenuItems,
      highlightedItemId: composerHighlightedItemId,
      currentSearchKey: composerMenuSearchKey,
      highlightedSearchKey: composerHighlightedSearchKey,
    });
    return composerMenuItems.find((item) => item.id === activeItemId) ?? null;
  }, [
    composerHighlightedItemId,
    composerHighlightedSearchKey,
    composerMenuItems,
    composerMenuSearchKey,
  ]);

  composerMenuOpenRef.current = composerMenuOpen;
  composerMenuItemsRef.current = composerMenuItems;
  activeComposerMenuItemRef.current = activeComposerMenuItem;

  const nonPersistedComposerImageIdSet = useMemo(
    () => new Set(nonPersistedComposerImageIds),
    [nonPersistedComposerImageIds],
  );

  const isComposerApprovalState = activePendingApproval !== null;
  const activePendingUserInput = pendingUserInputs[0] ?? null;
  const isChoiceOnlyPendingQuestion =
    activePendingProgress?.activeQuestion?.allowCustomAnswer === false;
  const showComposerTopDrawer =
    isComposerApprovalState ||
    pendingUserInputs.length > 0 ||
    (showPlanFollowUpPrompt && activeProposedPlan !== null);
  const showComposerAttachAction =
    fileStagingLimit !== null &&
    (!activePendingProgress ||
      (supportsQuestionAttachments &&
        activePendingProgress.activeQuestion?.allowCustomAnswer !== false));

  const isComposerMenuLoading =
    (composerTriggerKind === "path" && pathTriggerQuery.length > 0 && workspaceEntries.isPending) ||
    (composerTriggerKind === "pull-request" &&
      pullRequestProjectId !== null &&
      pullRequestRepository !== null &&
      (pullRequestLookup.isPending ||
        pullRequestTextQuery !== debouncedPullRequestTextQuery ||
        pullRequestTriggerNumber !== debouncedPullRequestNumber ||
        exactPullRequestLookup.isPending));
  const composerMenuEmptyState = useMemo(() => {
    if (composerTriggerKind === "skill") {
      return "No skills found. Try / to browse provider commands.";
    }
    if (composerTriggerKind === "pull-request") {
      if (pullRequestProjectId === null || pullRequestRepository === null) {
        return "Pull requests are not available for this project.";
      }
      if (
        pullRequestLookup.error !== null ||
        pullRequestLookup.data?.errors.some((error) => error.projectId === pullRequestProjectId)
      ) {
        return "Pull requests could not be read for this project.";
      }
      return composerTrigger?.query
        ? `No pull request matches ${composerTrigger.query}.`
        : "No pull requests found in this repository.";
    }
    return composerTriggerKind === "path"
      ? "No matching files or folders."
      : "No matching command.";
  }, [
    composerTrigger,
    composerTriggerKind,
    pullRequestLookup.data?.errors,
    pullRequestLookup.error,
    pullRequestProjectId,
    pullRequestRepository,
  ]);

  // ------------------------------------------------------------------
  // Provider traits UI
  // ------------------------------------------------------------------
  const setPromptFromTraits = useCallback(
    (nextPrompt: string) => {
      if (nextPrompt === promptRef.current) {
        scheduleComposerFocus();
        return;
      }
      promptRef.current = nextPrompt;
      setComposerDraftPrompt(composerDraftTarget, nextPrompt);
      const nextCursor = collapseExpandedComposerCursor(nextPrompt, nextPrompt.length);
      setComposerCursor(nextCursor);
      setComposerTrigger(detectComposerTrigger(nextPrompt, nextPrompt.length));
      scheduleComposerFocus();
    },
    [
      composerDraftTarget,
      promptRef,
      scheduleComposerFocus,
      setComposerDraftPrompt,
      setComposerTrigger,
    ],
  );

  const providerTraitsMenuContent = renderProviderTraitsMenuContent({
    provider: selectedProvider,
    instanceId: selectedInstanceId,
    ...(routeKind === "server" ? { threadRef: routeThreadRef } : {}),
    ...(routeKind === "draft" && draftId ? { draftId } : {}),
    model: selectedModel,
    models: selectedProviderModels,
    modelOptions: composerModelOptions?.[selectedInstanceId],
    prompt,
    onPromptChange: setPromptFromTraits,
    planModeEnabled: settings.planModeEnabled,
  });
  const providerTraitsPickerInput = {
    provider: selectedProvider,
    instanceId: selectedInstanceId,
    ...(routeKind === "server" ? { threadRef: routeThreadRef } : {}),
    ...(routeKind === "draft" && draftId ? { draftId } : {}),
    model: selectedModel,
    models: selectedProviderModels,
    modelOptions: composerModelOptions?.[selectedInstanceId],
    prompt,
    onPromptChange: setPromptFromTraits,
    planModeEnabled: settings.planModeEnabled,
    isComposerOwned: true,
  } satisfies Parameters<typeof renderProviderTraitsPicker>[0];
  const pendingPrimaryAction = useMemo(
    () =>
      activePendingProgress
        ? {
            questionIndex: activePendingProgress.questionIndex,
            isLastQuestion: activePendingProgress.isLastQuestion,
            canAdvance:
              activePendingProgress.canAdvance &&
              !attachmentBlockReason &&
              !(questionPreparations[attachmentTargetKey] ?? 0),
            isResponding: activePendingIsResponding,
            isComplete: Boolean(activePendingResolvedAnswers),
          }
        : null,
    [
      activePendingIsResponding,
      activePendingProgress,
      activePendingResolvedAnswers,
      attachmentBlockReason,
      questionPreparations,
      attachmentTargetKey,
    ],
  );

  // ------------------------------------------------------------------
  // Prompt helpers
  // ------------------------------------------------------------------
  const setPrompt = useCallback(
    (nextPrompt: string) => {
      setComposerDraftPrompt(composerDraftTarget, nextPrompt);
    },
    [composerDraftTarget, setComposerDraftPrompt],
  );

  const addComposerImage = useCallback(
    (image: ComposerImageAttachment) => addComposerDraftImages(attachmentDraftTarget, [image]),
    [attachmentDraftTarget, addComposerDraftImages],
  );

  const addComposerImagesToDraft = useCallback(
    (images: ComposerImageAttachment[]) => addComposerDraftImages(attachmentDraftTarget, images),
    [attachmentDraftTarget, addComposerDraftImages],
  );

  const addComposerFilesToDraft = useCallback(
    (files: ComposerFileAttachment[]) =>
      addComposerDraftFiles(attachmentDraftTarget, files, {
        appendReference: questionAttachmentTarget === null,
      }),
    [addComposerDraftFiles, attachmentDraftTarget, questionAttachmentTarget],
  );

  const removeComposerImageFromDraft = useCallback(
    (imageId: string) => {
      if (questionAttachmentTarget && activePendingIsResponding) return;
      releaseAttachmentUpload(imageId);
      removeComposerDraftImage(attachmentDraftTarget, imageId);
    },
    [
      attachmentDraftTarget,
      questionAttachmentTarget,
      activePendingIsResponding,
      removeComposerDraftImage,
    ],
  );

  const removeComposerFileFromDraft = useCallback(
    (fileId: string) => {
      if (questionAttachmentTarget && activePendingIsResponding) return;
      // Release by the draft attachment, not the bare queue key: a hydrated
      // file's upload lives server-side under its persisted attachment id.
      const file = composerFilesRef.current.find((candidate) => candidate.id === fileId);
      if (file) {
        releaseDraftAttachment(file);
      } else {
        releaseAttachmentUpload(fileId);
      }
      removeComposerDraftFile(attachmentDraftTarget, fileId);
    },
    [
      attachmentDraftTarget,
      questionAttachmentTarget,
      activePendingIsResponding,
      composerFilesRef,
      removeComposerDraftFile,
    ],
  );

  const addComposerDraftTerminalContexts = useComposerDraftStore(
    (store) => store.addTerminalContexts,
  );
  const addComposerDraftReviewComment = useComposerDraftStore((store) => store.addReviewComment);
  const addComposerDraftPreviewAnnotation = useComposerDraftStore(
    (store) => store.addPreviewAnnotation,
  );
  const buildContextClipboardFragment = useCallback(
    (contextIds: ReadonlyArray<string>): string | null => {
      const wanted = new Set(contextIds);
      // An annotation's screenshot is referenced by the annotation record, not by the copied
      // text. Pull it in so the round-trip keeps the image the annotation points at.
      for (const annotation of composerPreviewAnnotations) {
        if (
          wanted.has(previewAnnotationContextId(annotation.id)) &&
          composerImages.some((image) => image.id === annotation.id)
        ) {
          wanted.add(toKindScopedComposerContextId("image", annotation.id));
        }
      }
      const records: ComposerContextRecord[] = [
        ...composerTerminalContexts
          .filter((c) => wanted.has(terminalContextReference(c).contextId))
          .map(terminalContextRecord),
        ...composerReviewComments
          .filter((c) => wanted.has(reviewCommentContextId(c.id)))
          .map(reviewCommentContextRecord),
        ...composerPreviewAnnotations
          .filter((a) => wanted.has(previewAnnotationContextId(a.id)))
          .map((annotation) =>
            previewAnnotationContextRecord(annotation, {
              screenshotContextId: composerImages.some((image) => image.id === annotation.id)
                ? annotation.id
                : undefined,
            }),
          ),
        ...[...composerImages, ...composerFiles]
          .filter((attachment) =>
            wanted.has(toKindScopedComposerContextId(attachment.type, attachment.id)),
          )
          .flatMap((attachment) => {
            const record = uploadedAttachmentContextRecord(
              attachment,
              uploadsByImageId[attachment.id],
            );
            return record ? [record] : [];
          }),
      ];
      if (records.length === 0) return null;
      return encodeComposerContextFragment({
        version: 1,
        source: { environmentId, ...(activeThread ? { threadId: activeThread.id } : {}) },
        records,
      });
    },
    [
      activeThread,
      composerFiles,
      composerImages,
      composerPreviewAnnotations,
      composerReviewComments,
      composerTerminalContexts,
      environmentId,
      uploadsByImageId,
    ],
  );
  const createAssetUrl = useAtomQueryRunner(assetEnvironment.createUrl, { reportFailure: false });
  /**
   * Bytes for a pasted image or file come back through the source environment's asset URL
   * (the client is the only party that can reach both) and re-enter this draft as a normal
   * attachment under a fresh id. The pasted chip is rewritten to that id and reads as
   * unresolved until the bytes land; a failed transfer says so and leaves the chip to remove.
   */
  const runAttachmentImport = useCallback(
    async (
      record: Extract<ComposerContextRecord, { kind: "image" | "file" }>,
      localId: string,
      sourceEnvironmentId: EnvironmentId,
      importTargetKey: string,
    ) => {
      const fail = (reason: string) => {
        toastManager.add({
          type: "error",
          title: `Couldn't bring ${record.name} into this message`,
          description: `${reason} Remove the chip or attach the file again.`,
        });
      };
      const sourceConnection = readPreparedConnection(sourceEnvironmentId);
      if (!sourceConnection) {
        fail("The environment it came from is not connected.");
        return;
      }
      const result = await createAssetUrl({
        environmentId: sourceEnvironmentId,
        input: { resource: { _tag: "attachment", attachmentId: record.attachmentId } },
      });
      const url =
        result._tag === "Success"
          ? resolveAssetUrl(sourceConnection.httpBaseUrl, result.value.relativeUrl)
          : null;
      if (!url) {
        fail("The original attachment is no longer available.");
        return;
      }
      let blob: Blob;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        blob = await response.blob();
      } catch {
        fail("Downloading it from the source failed.");
        return;
      }
      const file = new File([blob], record.name, { type: record.mimeType || blob.type });
      // The draft these bytes belong to may have been sent or switched away from while they
      // downloaded. Dropping them here keeps them out of whatever draft is open now.
      if (attachmentTargetKeyRef.current !== importTargetKey) return;
      if (record.kind === "image") {
        const accepted = addComposerImage({
          type: "image",
          id: localId,
          name: record.name,
          mimeType: file.type,
          sizeBytes: file.size,
          previewUrl: URL.createObjectURL(file),
          file,
        });
        if (!accepted.includes(localId))
          fail("The draft rejected this attachment (duplicate or attachment limit reached).");
      } else {
        const accepted = addComposerFilesToDraft([
          {
            type: "file",
            id: localId,
            name: record.name,
            mimeType: file.type,
            sizeBytes: file.size,
            file,
          },
        ]);
        if (!accepted.includes(localId))
          fail("The draft rejected this attachment (duplicate or attachment limit reached).");
      }
    },
    [addComposerFilesToDraft, addComposerImage, attachmentTargetKey, createAssetUrl],
  );
  const importAttachmentRecord = useCallback(
    async (
      record: Extract<ComposerContextRecord, { kind: "image" | "file" }>,
      localId: string,
      sourceEnvironmentId: EnvironmentId,
    ) => {
      // The chip lands in the draft immediately while these bytes are still downloading. Count
      // the transfer against its own draft so a send cannot snapshot a message whose chip has no
      // attachment behind it, and so bytes for an abandoned draft never enter the next one.
      const importTargetKey = attachmentTargetKey;
      pendingDraftWork.begin(importTargetKey);
      try {
        await runAttachmentImport(record, localId, sourceEnvironmentId, importTargetKey);
      } finally {
        pendingDraftWork.end(importTargetKey);
      }
    },
    [attachmentTargetKey, runAttachmentImport],
  );
  /**
   * Brings records into this draft (paste, stash restore). Binaries are transferred only
   * when `sourceEnvironmentId` is given; the stash restores its own images and files.
   */
  const importContextRecords = useCallback(
    (
      records: ReadonlyArray<ComposerContextRecord>,
      sourceEnvironmentId: EnvironmentId | null,
    ): ReadonlyMap<string, string> => {
      const rewritten = new Map<string, string>();
      const dependentAttachmentLocalIds = new Map<string, string>();
      const skippedDependentAttachmentIds = new Set<string>();
      // Resolve annotations before their dependent screenshot records even if a foreign
      // clipboard producer emitted the records in a different order.
      const orderedRecords = records.toSorted((left, right) =>
        left.kind === "preview-annotation" && right.kind !== "preview-annotation"
          ? -1
          : right.kind === "preview-annotation" && left.kind !== "preview-annotation"
            ? 1
            : 0,
      );
      for (const candidate of orderedRecords) {
        // Producer ids fold into context ids, so two different excerpts can collide. Only skip
        // when the draft already holds the same payload; a colliding but different record is
        // re-minted under a fresh id so both survive the paste.
        const record = asKnownContextRecord(candidate);
        if (!record) continue;
        const existing = composerContextImportLookupIds(record).flatMap((contextId) => {
          const found = composerContextRecords.get(contextId);
          return found ? [found] : [];
        })[0];
        const existingRecord =
          existing?.kind === "terminal"
            ? terminalContextRecord(existing.record)
            : existing?.kind === "review-comment"
              ? reviewCommentContextRecord(existing.record)
              : existing?.kind === "preview-annotation"
                ? previewAnnotationContextRecord(existing.record)
                : existing
                  ? (uploadedContextRecordFromDraft(existing) ?? undefined)
                  : undefined;
        if (existingRecord && isSameComposerContextPayload(existingRecord, record)) {
          if (record.kind === "preview-annotation" && record.screenshotContextId) {
            skippedDependentAttachmentIds.add(record.screenshotContextId);
          }
          continue;
        }
        const conflicts = existing !== undefined;
        switch (record.kind) {
          case "terminal": {
            const threadId = activeThread?.id ?? activeThreadId;
            if (!threadId) break;
            const imported = terminalContextDraftFromRecord(record, threadId);
            const draft = conflicts ? { ...imported, id: randomUUID() } : imported;
            addComposerDraftTerminalContexts(composerDraftTarget, [draft], {
              appendReference: false,
            });
            rewritten.set(record.contextId, terminalContextReference(draft).contextId);
            break;
          }
          case "review-comment": {
            const imported = reviewCommentFromRecord(record);
            const comment = conflicts ? { ...imported, id: randomUUID() } : imported;
            addComposerDraftReviewComment(composerDraftTarget, comment, {
              appendReference: false,
            });
            rewritten.set(record.contextId, reviewCommentContextId(comment.id));
            break;
          }
          case "element":
          case "preview-annotation": {
            const imported =
              record.kind === "element"
                ? elementContextToPreviewAnnotation(record, randomUUID(), new Date().toISOString())
                : previewAnnotationFromRecord(record);
            const annotation = conflicts ? { ...imported, id: randomUUID() } : imported;
            if (record.kind === "preview-annotation" && record.screenshotContextId) {
              dependentAttachmentLocalIds.set(record.screenshotContextId, annotation.id);
            }
            addComposerDraftPreviewAnnotation(composerDraftTarget, annotation, {
              appendReference: false,
            });
            rewritten.set(record.contextId, previewAnnotationContextId(annotation.id));
            break;
          }
          case "image":
          case "file": {
            if (skippedDependentAttachmentIds.has(record.contextId)) break;
            if (sourceEnvironmentId === null && !conflicts) {
              rewritten.set(record.contextId, record.contextId);
              break;
            }
            if (sourceEnvironmentId === null) break;
            const localId = dependentAttachmentLocalIds.get(record.contextId) ?? randomUUID();
            rewritten.set(record.contextId, toKindScopedComposerContextId(record.kind, localId));
            void importAttachmentRecord(record, localId, sourceEnvironmentId);
            break;
          }
          default:
            break;
        }
      }
      return rewritten;
    },
    [
      activeThread,
      activeThreadId,
      addComposerDraftPreviewAnnotation,
      addComposerDraftReviewComment,
      addComposerDraftTerminalContexts,
      composerContextRecords,
      composerDraftTarget,
      importAttachmentRecord,
    ],
  );
  const importContextFragment = useCallback(
    (fragment: ComposerContextClipboardFragment): ReadonlyMap<string, string> =>
      importContextRecords(fragment.records, fragment.source.environmentId),
    [importContextRecords],
  );

  // ------------------------------------------------------------------
  // Sync refs back to parent
  // ------------------------------------------------------------------
  useEffect(() => {
    promptRef.current = prompt;
    setComposerCursor((existing) => clampCollapsedComposerCursor(prompt, existing));
  }, [prompt, promptRef]);

  useEffect(() => {
    if (composerSubmissionError === null) return;
    const nextError = getComposerPromptLengthValidationMessage(prompt);
    if (nextError !== composerSubmissionError) {
      setComposerSubmissionError(nextError);
    }
  }, [composerSubmissionError, prompt]);

  useEffect(() => {
    setProviderInputSubmissionError(null);
  }, [
    composerPreviewAnnotations,
    composerReviewComments,
    composerTerminalContexts,
    prompt,
    selectedModel,
    selectedPromptEffort,
    selectedProvider,
  ]);

  useEffect(() => {
    composerImagesRef.current = composerImages;
  }, [composerImages, composerImagesRef]);

  useEffect(() => {
    composerFilesRef.current = composerFiles;
  }, [composerFiles, composerFilesRef]);

  useEffect(() => {
    composerTerminalContextsRef.current = composerTerminalContexts;
  }, [composerTerminalContexts, composerTerminalContextsRef]);

  // ------------------------------------------------------------------
  // Composer menu highlight sync
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!composerMenuOpen) {
      setComposerHighlightedItemId(null);
      setComposerHighlightedSearchKey(null);
      return;
    }
    const nextActiveItemId = resolveComposerMenuActiveItemId({
      items: composerMenuItems,
      highlightedItemId: composerHighlightedItemId,
      currentSearchKey: composerMenuSearchKey,
      highlightedSearchKey: composerHighlightedSearchKey,
    });
    setComposerHighlightedItemId((existing) =>
      existing === nextActiveItemId ? existing : nextActiveItemId,
    );
    setComposerHighlightedSearchKey((existing) =>
      existing === composerMenuSearchKey ? existing : composerMenuSearchKey,
    );
  }, [
    composerHighlightedItemId,
    composerHighlightedSearchKey,
    composerMenuItems,
    composerMenuOpen,
    composerMenuSearchKey,
  ]);

  const lastSyncedPendingInputRef = useRef<{
    requestId: string | null;
    questionId: string | null;
  } | null>(null);

  useEffect(() => {
    const nextCustomAnswer = activePendingProgress?.customAnswer;
    if (typeof nextCustomAnswer !== "string") {
      // The question is gone and the editor shows the thread draft again. The
      // ref still holds the last answer text, and Send reads the ref. Place
      // the caret at the end so the next keystroke appends.
      if (lastSyncedPendingInputRef.current !== null) {
        promptRef.current = prompt;
        const { cursor, trigger } = composerStateAtPromptEnd(prompt);
        setComposerCursor(cursor);
        resetComposerTrigger(trigger);
      }
      lastSyncedPendingInputRef.current = null;
      return;
    }

    const nextRequestId = activePendingUserInput?.requestId ?? null;
    const nextQuestionId = activePendingProgress?.activeQuestion?.id ?? null;
    const questionChanged =
      lastSyncedPendingInputRef.current?.requestId !== nextRequestId ||
      lastSyncedPendingInputRef.current?.questionId !== nextQuestionId;
    const textChangedExternally = promptRef.current !== nextCustomAnswer;

    lastSyncedPendingInputRef.current = {
      requestId: nextRequestId,
      questionId: nextQuestionId,
    };

    if (!questionChanged && !textChangedExternally) {
      return;
    }

    promptRef.current = nextCustomAnswer;
    const { cursor, trigger } = composerStateAtPromptEnd(nextCustomAnswer);
    setComposerCursor(cursor);
    resetComposerTrigger(trigger);
    setComposerHighlightedItemId(null);
  }, [
    activePendingProgress?.customAnswer,
    activePendingProgress?.activeQuestion?.id,
    activePendingUserInput?.requestId,
    prompt,
    promptRef,
    resetComposerTrigger,
  ]);

  // ------------------------------------------------------------------
  // Reset compositor state on thread/draft change
  // ------------------------------------------------------------------
  useEffect(() => {
    setComposerHighlightedItemId(null);
    setComposerSubmissionError(null);
    setProviderInputSubmissionError(null);
    setComposerCursor(collapseExpandedComposerCursor(promptRef.current, promptRef.current.length));
    resetComposerTrigger(detectComposerTrigger(promptRef.current, promptRef.current.length));
    setIsDragOverComposer(false);
  }, [draftId, activeThreadId, promptRef, resetComposerTrigger]);

  // ------------------------------------------------------------------
  // Image persist effect
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (composerImages.length === 0) {
        clearComposerDraftPersistedAttachments(attachmentDraftTarget);
        return;
      }
      const getPersistedAttachmentsForThread = () =>
        getComposerDraft(attachmentDraftTarget)?.persistedAttachments ?? [];
      try {
        const currentPersistedAttachments = getPersistedAttachmentsForThread();
        const existingPersistedById = new Map(
          currentPersistedAttachments.map((attachment) => [attachment.id, attachment]),
        );
        const stagedAttachmentById = new Map<string, PersistedComposerImageAttachment>();
        await Promise.all(
          composerImages.map(async (image) => {
            try {
              const dataUrl = await readFileAsDataUrl(image.file);
              stagedAttachmentById.set(image.id, {
                id: image.id,
                name: image.name,
                mimeType: image.mimeType,
                sizeBytes: image.sizeBytes,
                dataUrl,
                ...(image.source ? { source: image.source } : {}),
              });
            } catch {
              const existingPersisted = existingPersistedById.get(image.id);
              if (existingPersisted) {
                stagedAttachmentById.set(image.id, existingPersisted);
              }
            }
          }),
        );
        const serialized = Array.from(stagedAttachmentById.values());
        if (cancelled) return;
        syncComposerDraftPersistedAttachments(attachmentDraftTarget, serialized);
      } catch {
        const currentImageIds = new Set(composerImages.map((image) => image.id));
        const fallbackPersistedAttachments = getPersistedAttachmentsForThread();
        const fallbackPersistedIds: Array<string> = [];
        for (const attachment of fallbackPersistedAttachments) {
          if (currentImageIds.has(attachment.id)) {
            fallbackPersistedIds.push(attachment.id);
          }
        }
        const fallbackPersistedIdSet = new Set(fallbackPersistedIds);
        const fallbackAttachments = fallbackPersistedAttachments.filter((attachment) =>
          fallbackPersistedIdSet.has(attachment.id),
        );
        if (cancelled) return;
        syncComposerDraftPersistedAttachments(attachmentDraftTarget, fallbackAttachments);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    attachmentDraftTarget,
    clearComposerDraftPersistedAttachments,
    composerImages,
    getComposerDraft,
    syncComposerDraftPersistedAttachments,
  ]);

  // ------------------------------------------------------------------
  // Callbacks: prompt change
  // ------------------------------------------------------------------
  /**
   * Payloads for chips the prompt no longer references. History undo restores the
   * reference text but knows nothing about the draft records behind it, so a delete keeps its
   * payload here and an undo puts it back rather than leaving a dangling chip.
   */
  const removedContextPayloadsRef = useRef<{
    terminals: Map<string, TerminalContextDraft>;
    reviewComments: Map<string, ReviewCommentContext>;
  }>({ terminals: new Map(), reviewComments: new Map() });
  const removedAttachmentContextPayloadsRef = useRef<RetainedAttachmentContextPayloads>({
    files: new Map(),
    previewAnnotations: new Map(),
  });

  const onPromptChange = useCallback(
    (
      nextPrompt: string,
      nextCursor: number,
      expandedCursor: number,
      cursorAdjacentToMention: boolean,
      contextIds: string[],
    ) => {
      if (activePendingProgress?.activeQuestion && pendingUserInputs.length > 0) {
        if (activePendingProgress.activeQuestion.allowCustomAnswer === false) return;
        setComposerCursor(nextCursor);
        setComposerTrigger(
          cursorAdjacentToMention ? null : detectComposerTrigger(nextPrompt, expandedCursor),
        );
        onChangeActivePendingUserInputCustomAnswer(
          activePendingProgress.activeQuestion.id,
          nextPrompt,
          nextCursor,
          expandedCursor,
          cursorAdjacentToMention,
        );
        return;
      }
      promptRef.current = nextPrompt;
      setPrompt(nextPrompt);
      // Any edit ends browsing, even one later undone by hand: typing a
      // character and deleting it leaves the text equal to the recall, and
      // ArrowDown must move the caret then, not clear the composer.
      if (promptHistoryPositionRef.current?.recalled !== nextPrompt) {
        promptHistoryPositionRef.current = null;
      }
      const referenced = new Set(contextIds);
      const retained = removedContextPayloadsRef.current;

      // An undone delete brings the reference back; restore the payload it points at.
      const liveTerminalIds = new Set<string>(
        composerTerminalContexts.map((context) => terminalContextReference(context).contextId),
      );
      const restoredTerminals = [...referenced].flatMap((contextId) => {
        if (liveTerminalIds.has(contextId)) return [];
        const context = retained.terminals.get(contextId);
        return context ? [context] : [];
      });
      const nextTerminals = [
        ...composerTerminalContexts.filter((context) =>
          referenced.has(terminalContextReference(context).contextId),
        ),
        ...restoredTerminals,
      ];
      for (const context of composerTerminalContexts) {
        const contextId = terminalContextReference(context).contextId;
        if (!referenced.has(contextId)) retained.terminals.set(contextId, context);
      }
      if (
        nextTerminals.length !== composerTerminalContexts.length ||
        restoredTerminals.length > 0
      ) {
        setComposerDraftTerminalContexts(composerDraftTarget, nextTerminals);
      }

      for (const comment of composerReviewComments) {
        const contextId = reviewCommentContextId(comment.id);
        if (!referenced.has(contextId)) {
          retained.reviewComments.set(contextId, comment);
          removeComposerDraftReviewComment(composerDraftTarget, comment.id);
        }
      }
      const liveReviewIds = new Set<string>(
        composerReviewComments.map((comment) => reviewCommentContextId(comment.id)),
      );
      for (const contextId of referenced) {
        if (liveReviewIds.has(contextId)) continue;
        const comment = retained.reviewComments.get(contextId);
        if (comment) {
          addComposerDraftReviewComment(composerDraftTarget, comment, { appendReference: false });
        }
      }

      const attachmentChanges = reconcileAttachmentContextReferences({
        referencedContextIds: referenced,
        files: composerFiles,
        images: composerImages,
        previewAnnotations: composerPreviewAnnotations,
        retained: removedAttachmentContextPayloadsRef.current,
      });
      for (const annotationId of attachmentChanges.annotationIdsToRemove) {
        // Keep the upload queue entry alive: undo restores the image that owns it.
        removeComposerDraftPreviewAnnotation(composerDraftTarget, annotationId);
      }
      for (const restored of attachmentChanges.annotationsToRestore) {
        if (restored.image) addComposerDraftImages(attachmentDraftTarget, [restored.image]);
        addComposerDraftPreviewAnnotation(composerDraftTarget, restored.annotation, {
          appendReference: false,
        });
      }
      for (const fileId of attachmentChanges.filesToRemove) {
        // The retained File and upload are still sendable if the editor restores the chip.
        removeComposerDraftFile(attachmentDraftTarget, fileId);
      }
      if (attachmentChanges.filesToRestore.length > 0) {
        addComposerDraftFiles(attachmentDraftTarget, attachmentChanges.filesToRestore);
      }
      setComposerCursor(nextCursor);
      setComposerTrigger(
        cursorAdjacentToMention ? null : detectComposerTrigger(nextPrompt, expandedCursor),
      );
    },
    [
      activePendingProgress?.activeQuestion,
      pendingUserInputs.length,
      onChangeActivePendingUserInputCustomAnswer,
      promptRef,
      setPrompt,
      setComposerTrigger,
      composerDraftTarget,
      composerTerminalContexts,
      setComposerDraftTerminalContexts,
      composerReviewComments,
      composerPreviewAnnotations,
      composerImages,
      composerFiles,
      removeComposerDraftReviewComment,
      removeComposerDraftPreviewAnnotation,
      removeComposerDraftFile,
      addComposerDraftReviewComment,
      addComposerDraftPreviewAnnotation,
      addComposerDraftImages,
      addComposerDraftFiles,
      attachmentDraftTarget,
    ],
  );

  // ------------------------------------------------------------------
  // Callbacks: prompt replacement / menu
  // ------------------------------------------------------------------
  const applyPromptReplacement = useCallback(
    (
      rangeStart: number,
      rangeEnd: number,
      replacement: string,
      options?: {
        expectedText?: string;
        expandedCursorAfterReplace?: number;
        focusEditorAfterReplace?: boolean;
        citationComment?: { start: number; sourceAnchor: AssistantCitationSourceAnchor };
      },
    ): boolean => {
      if (
        activePendingUserInput &&
        activePendingProgress?.activeQuestion?.allowCustomAnswer === false
      ) {
        return false;
      }
      const currentText = promptRef.current;
      const safeStart = Math.max(0, Math.min(currentText.length, rangeStart));
      const safeEnd = Math.max(safeStart, Math.min(currentText.length, rangeEnd));
      if (
        options?.expectedText !== undefined &&
        currentText.slice(safeStart, safeEnd) !== options.expectedText
      ) {
        return false;
      }
      const next = replaceTextRange(promptRef.current, rangeStart, rangeEnd, replacement);
      const nextCursor = collapseExpandedComposerCursor(
        next.text,
        options?.expandedCursorAfterReplace ?? next.cursor,
      );
      const nextExpandedCursor = expandCollapsedComposerCursor(next.text, nextCursor);
      if (options?.citationComment) {
        composerEditorRef.current?.requestCitationComment({
          previousValue: currentText,
          value: next.text,
          citationStart: options.citationComment.start,
          sourceAnchor: options.citationComment.sourceAnchor,
        });
      }
      promptRef.current = next.text;
      const activePendingQuestion = activePendingProgress?.activeQuestion;
      if (activePendingQuestion && activePendingUserInput) {
        onChangeActivePendingUserInputCustomAnswer(
          activePendingQuestion.id,
          next.text,
          nextCursor,
          nextExpandedCursor,
          false,
        );
      } else {
        setPrompt(next.text);
      }
      setComposerCursor(nextCursor);
      setComposerTrigger(detectComposerTrigger(next.text, nextExpandedCursor));
      if (options?.focusEditorAfterReplace !== false) {
        window.requestAnimationFrame(() => {
          // Type-to-focus routes only the first key through here; once the
          // controlled update focuses the editor, later keys land natively.
          // Skip the deferred caret placement when the draft has moved on,
          // or it drags the caret back behind what was typed since.
          if (promptRef.current !== next.text) return;
          composerEditorRef.current?.focusAt(nextCursor);
        });
      }
      return true;
    },
    [
      activePendingProgress?.activeQuestion,
      activePendingUserInput,
      onChangeActivePendingUserInputCustomAnswer,
      promptRef,
      setPrompt,
      setComposerTrigger,
    ],
  );

  const readComposerSnapshot = useCallback((): {
    value: string;
    cursor: number;
    expandedCursor: number;
    contextIds: string[];
  } => {
    const editorSnapshot = composerEditorRef.current?.readSnapshot();
    if (editorSnapshot) {
      return editorSnapshot;
    }
    return {
      value: promptRef.current,
      cursor: composerCursor,
      expandedCursor: expandCollapsedComposerCursor(promptRef.current, composerCursor),
      contextIds: collectInlineContextIds(promptRef.current),
    };
  }, [composerCursor, promptRef]);

  const resolveActiveComposerTrigger = useCallback((): {
    snapshot: { value: string; cursor: number; expandedCursor: number };
    trigger: ComposerTrigger | null;
  } => {
    const snapshot = readComposerSnapshot();
    return {
      snapshot,
      trigger: resolveComposerTrigger(
        detectComposerTrigger(snapshot.value, snapshot.expandedCursor),
      ),
    };
  }, [readComposerSnapshot, resolveComposerTrigger]);

  const { onUsageLimitsCommand } = props;
  const onSelectComposerItem = useCallback(
    (item: ComposerCommandItem) => {
      if (composerSelectLockRef.current) return;
      composerSelectLockRef.current = true;
      window.requestAnimationFrame(() => {
        composerSelectLockRef.current = false;
      });
      const { snapshot, trigger } = resolveActiveComposerTrigger();
      if (!trigger) return;
      if (item.type === "path") {
        const replacement = `${serializeComposerFileLink(item.path)} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
        );
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "slash-command") {
        if (item.command === "model") {
          const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
            expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
            focusEditorAfterReplace: false,
          });
          if (applied) {
            setComposerHighlightedItemId(null);
            setIsComposerModelPickerOpen(true);
          }
          return;
        }
        if (!planModeUiEnabled) return;
        void handleInteractionModeChange(item.command === "plan" ? "plan" : "default");
        const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
          expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
        });
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "provider-slash-command") {
        if (item.command.name === USAGE_LIMITS_COMMAND.name && onUsageLimitsCommand) {
          const applied = applyPromptReplacement(trigger.rangeStart, trigger.rangeEnd, "", {
            expectedText: snapshot.value.slice(trigger.rangeStart, trigger.rangeEnd),
            focusEditorAfterReplace: false,
          });
          if (applied) {
            setComposerHighlightedItemId(null);
            onUsageLimitsCommand();
          }
          return;
        }
        const replacement = `/${item.command.name} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
        );
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "skill") {
        const replacement = `$${item.skill.name} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
        );
        if (applied) {
          setComposerHighlightedItemId(null);
        }
        return;
      }
      if (item.type === "pull-request") {
        if (
          trigger.kind !== "pull-request" ||
          !composerMenuItemsRef.current.some((candidate) => candidate.id === item.id)
        ) {
          return;
        }
        const comment = buildPullRequestReferenceContext(item.pullRequest);
        const replacement = `${formatInlineContextReference(
          reviewCommentContextReference(comment),
        )} `;
        const replacementRangeEnd = extendReplacementRangeForTrailingSpace(
          snapshot.value,
          trigger.rangeEnd,
          replacement,
        );
        const applied = applyPromptReplacement(
          trigger.rangeStart,
          replacementRangeEnd,
          replacement,
          { expectedText: snapshot.value.slice(trigger.rangeStart, replacementRangeEnd) },
        );
        if (applied) {
          addComposerDraftReviewComment(composerDraftTarget, comment, {
            appendReference: false,
          });
          setComposerHighlightedItemId(null);
        }
        return;
      }
    },
    [
      addComposerDraftReviewComment,
      applyPromptReplacement,
      composerDraftTarget,
      handleInteractionModeChange,
      planModeUiEnabled,
      onUsageLimitsCommand,
      resolveActiveComposerTrigger,
    ],
  );

  const onComposerMenuItemHighlighted = useCallback(
    (itemId: string | null) => {
      setComposerHighlightedItemId(itemId);
      setComposerHighlightedSearchKey(composerMenuSearchKey);
    },
    [composerMenuSearchKey],
  );

  const nudgeComposerMenuHighlight = useCallback(
    (key: "ArrowDown" | "ArrowUp") => {
      if (composerMenuItems.length === 0) return;
      const highlightedIndex = composerMenuItems.findIndex(
        (item) => item.id === composerHighlightedItemId,
      );
      const normalizedIndex =
        highlightedIndex >= 0 ? highlightedIndex : key === "ArrowDown" ? -1 : 0;
      const offset = key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (normalizedIndex + offset + composerMenuItems.length) % composerMenuItems.length;
      const nextItem = composerMenuItems[nextIndex];
      setComposerHighlightedItemId(nextItem?.id ?? null);
    },
    [composerHighlightedItemId, composerMenuItems],
  );

  // A phone drops its keyboard once a message is on its way.
  const blurMobileComposerAfterSend = useCallback(() => {
    if (!isMobileViewport) return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, [isMobileViewport]);

  const shouldBlurMobileComposerOnSubmit = useCallback(() => {
    if (!isMobileViewport) return false;
    if (
      isSendBusy ||
      isSendDisabled ||
      isConnecting ||
      noProviderAvailable ||
      environmentUnavailable !== null ||
      phase === "running"
    ) {
      return false;
    }
    if (activePendingProgress) {
      return activePendingProgress.isLastQuestion && Boolean(activePendingResolvedAnswers);
    }
    return showPlanFollowUpPrompt || composerSendState.hasSendableContent;
  }, [
    activePendingProgress,
    activePendingResolvedAnswers,
    composerSendState.hasSendableContent,
    environmentUnavailable,
    isConnecting,
    isMobileViewport,
    isSendBusy,
    isSendDisabled,
    noProviderAvailable,
    phase,
    showPlanFollowUpPrompt,
  ]);

  const submitComposer = useCallback(
    (event?: { preventDefault: () => void }, intent: ComposerSubmissionIntent = "foreground") => {
      if (noProviderAvailable || isSendDisabled) {
        event?.preventDefault();
        return;
      }
      // A send while a pasted image is still compressing would strand that
      // image: the turn snapshot wouldn't include it, and it would surface
      // in the *next* draft instead. Only oversized images hit this — small
      // files clear the pending counter within a microtask.
      if (
        activeThreadId &&
        (pendingImageCompressionsRef.current.get(attachmentTargetKey) ?? 0) > 0
      ) {
        event?.preventDefault();
        toastManager.add({
          type: "info",
          title: "Still compressing a pasted image.",
          description: "Send again once its thumbnail appears.",
        });
        return;
      }
      // A pasted chip's bytes arrive over the network, so the same hazard applies for longer:
      // sending now would snapshot a chip with no attachment behind it.
      if (pendingDraftWork.has(attachmentTargetKey)) {
        event?.preventDefault();
        toastManager.add({
          type: "info",
          title: "Still bringing a pasted attachment into this message.",
          description: "Send again once its chip resolves.",
        });
        return;
      }
      const submission = submitComposerDraft({
        prompt: promptRef.current,
        submissionTarget: activePendingProgress ? "pending-user-input" : "provider-turn",
        event,
        onSend: (sendEvent) => {
          // ChatView reports its final composed-input preflight through the
          // composer handle before its first asynchronous send step.
          providerInputRejectedRef.current = false;
          onSend(sendEvent, intent);
          return !providerInputRejectedRef.current;
        },
      });
      setComposerSubmissionError(submission.validationMessage);
      if (!submission.didDispatch) return;
      if (shouldBlurMobileComposerOnSubmit()) {
        blurMobileComposerAfterSend();
      }
    },
    [
      activeThreadId,
      activePendingProgress,
      attachmentTargetKey,
      blurMobileComposerAfterSend,
      isSendDisabled,
      noProviderAvailable,
      onSend,
      promptRef,
      shouldBlurMobileComposerOnSubmit,
    ],
  );
  const submitCitationAndSend = useCallback(() => {
    const intent = composerSubmissionIntentForEnter({
      isMobileViewport,
      shiftKey: false,
      modifierKey: true,
      isDraftThread: routeKind === "draft",
    });
    submitComposer(undefined, intent ?? "foreground");
  }, [isMobileViewport, routeKind, submitComposer]);
  const compactThreadContext = useCallback(() => {
    if (
      compactDisabled ||
      noProviderAvailable ||
      activePendingApproval !== null ||
      pendingUserInputs.length > 0 ||
      phase === "running" ||
      isSendBusy ||
      isConnecting ||
      !activeThreadId
    ) {
      return;
    }
    onCompactContext();
  }, [
    activePendingApproval,
    activeThreadId,
    compactDisabled,
    isConnecting,
    isSendBusy,
    noProviderAvailable,
    onCompactContext,
    pendingUserInputs.length,
    phase,
  ]);
  // ------------------------------------------------------------------
  // Prompt history (ArrowUp / ArrowDown)
  // ------------------------------------------------------------------
  // Entries are built on the keypress, not per render: the timeline changes
  // on every streamed delta and ArrowUp is rare.
  const promptHistoryMessagesRef = useRef(promptHistoryMessages);
  promptHistoryMessagesRef.current = promptHistoryMessages;

  // The composer persists across threads. A recall from thread A must not
  // be treated as active in thread B, where the text-match fallback could
  // otherwise turn B's own draft into a browsing position.
  const promptHistoryTargetKey = composerTargetKey(composerDraftTarget);
  useEffect(() => {
    promptHistoryPositionRef.current = null;
  }, [promptHistoryTargetKey]);

  const replacePromptFromHistory = useCallback(
    (nextPrompt: string) => {
      promptRef.current = nextPrompt;
      setComposerDraftPrompt(composerDraftTarget, nextPrompt);
      setComposerCursor(collapseExpandedComposerCursor(nextPrompt, nextPrompt.length));
      setComposerTrigger(null);
      setComposerHighlightedItemId(null);
    },
    [composerDraftTarget, promptRef, setComposerDraftPrompt, setComposerTrigger],
  );

  const navigatePromptHistory = useCallback(
    (direction: "backward" | "forward", event: KeyboardEvent): boolean => {
      if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey || event.isComposing) {
        return false;
      }
      if (isComposerApprovalState || pendingUserInputs.length > 0) return false;
      // A composer holding an image, file, picked element, preview
      // annotation, or review comment is not empty. Recalling text into it
      // would send the old prompt with the new context, which is never what
      // ArrowUp meant.
      if (
        composerImagesRef.current.length > 0 ||
        composerFilesRef.current.length > 0 ||
        composerTerminalContextsRef.current.length > 0 ||
        composerPreviewAnnotations.length > 0 ||
        composerReviewComments.length > 0
      ) {
        return false;
      }
      // A typed draft with no active recall can never step, so skip the
      // layout read and the entry build for that common case.
      if (promptHistoryPositionRef.current === null && promptRef.current.length > 0) {
        return false;
      }
      const editor = composerEditorRef.current;
      if (!editor?.isCaretOnVisualEdge(direction === "backward" ? "start" : "end")) {
        return false;
      }
      const step = stepComposerPromptHistory({
        direction,
        entries: buildComposerPromptHistoryEntries(promptHistoryMessagesRef.current),
        position: promptHistoryPositionRef.current,
        currentPrompt: promptRef.current,
      });
      if (!step) return false;
      promptHistoryPositionRef.current = step.position;
      replacePromptFromHistory(step.prompt);
      return true;
    },
    [
      composerTerminalContextsRef,
      composerFilesRef,
      composerImagesRef,
      composerPreviewAnnotations.length,
      composerReviewComments.length,
      isComposerApprovalState,
      pendingUserInputs.length,
      promptRef,
      replacePromptFromHistory,
    ],
  );

  // ------------------------------------------------------------------
  // Callbacks: command key
  // ------------------------------------------------------------------
  const onComposerCommandKey = (
    key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab" | "Escape",
    event: KeyboardEvent,
    isTaskItem = false,
  ) => {
    if (key === "Tab" && event.shiftKey) {
      if (!planModeUiEnabled) return false;
      toggleInteractionMode();
      return true;
    }
    const { trigger } = resolveActiveComposerTrigger();
    const menuIsActive = composerMenuOpenRef.current || trigger !== null;
    if (key === "Escape") {
      if (!menuIsActive || event.isComposing || event.keyCode === 229) return false;
      dismissComposerTrigger(trigger);
      composerMenuOpenRef.current = false;
      return true;
    }
    if (menuIsActive) {
      const currentItems = composerMenuItemsRef.current;
      const selectedItem = activeComposerMenuItemRef.current ?? currentItems[0];
      if (key === "ArrowDown" && currentItems.length > 0) {
        nudgeComposerMenuHighlight("ArrowDown");
        return true;
      }
      if (key === "ArrowUp" && currentItems.length > 0) {
        nudgeComposerMenuHighlight("ArrowUp");
        return true;
      }
      if ((key === "Enter" || key === "Tab") && selectedItem) {
        onSelectComposerItem(selectedItem);
        return true;
      }
    }
    if (key === "ArrowUp" || key === "ArrowDown") {
      return navigatePromptHistory(key === "ArrowUp" ? "backward" : "forward", event);
    }
    const submissionIntent =
      key === "Enter"
        ? composerSubmissionIntentForEnter({
            isMobileViewport,
            shiftKey: event.shiftKey,
            modifierKey: event.metaKey || event.ctrlKey,
            isDraftThread: routeKind === "draft",
            isRunning: phase === "running",
            sendShortcut: settings.sendShortcut,
            prompt: promptRef.current,
          })
        : null;
    if (submissionIntent) {
      submitComposer(undefined, submissionIntent);
      return true;
    }
    // Native task splitting preserves marks and chips on both sides of the caret.
    if (key === "Enter" && isTaskItem) return false;
    if (!event.isComposing && (key === "Enter" || (key === "Tab" && !event.shiftKey))) {
      const selection = composerEditorRef.current?.readSelectionRange();
      const snapshot = readComposerSnapshot();
      if (selection && selection.start === selection.end && snapshot.value === promptRef.current) {
        const edit =
          key === "Enter"
            ? listContinuationForEnter(snapshot.value, selection.start)
            : listIndentForTab(snapshot.value, selection.start, selection.end);
        if (
          edit &&
          applyPromptReplacement(
            edit.start,
            edit.end,
            edit.replacement,
            key === "Tab"
              ? { expandedCursorAfterReplace: selection.start + edit.replacement.length }
              : undefined,
          )
        ) {
          return true;
        }
      }
    }
    return false;
  };

  // ------------------------------------------------------------------
  // Prompt stash (⌘S)
  // ------------------------------------------------------------------
  // Files remain tied to the environment that owns their uploaded bytes.
  const stashQueue = usePromptStashStore((state) => state.entries);
  const stashEntryToQueue = usePromptStashStore((state) => state.stashEntry);
  const takeStashEntry = usePromptStashStore((state) => state.takeEntry);
  const finalizeStashEntryImages = usePromptStashStore((state) => state.finalizeEntryImages);

  useEffect(() => {
    return () => {
      if (stashPulseTimeoutRef.current !== null) {
        window.clearTimeout(stashPulseTimeoutRef.current);
      }
    };
  }, []);

  /** Briefly highlight the badge so the save registers without a flourish. */
  const pulseStashBadge = useCallback(() => {
    stashPulseKeyRef.current += 1;
    setStashPulse({ key: stashPulseKeyRef.current, active: true });
    if (stashPulseTimeoutRef.current !== null) {
      window.clearTimeout(stashPulseTimeoutRef.current);
    }
    stashPulseTimeoutRef.current = window.setTimeout(() => {
      stashPulseTimeoutRef.current = null;
      setStashPulse((current) => ({ ...current, active: false }));
    }, 1200);
  }, []);

  const restoreStashEntry = useCallback(
    async (menuEntry: PromptStashEntry) => {
      const filesToVerify = menuEntry.files ?? [];
      if (filesToVerify.some((file) => file.environmentId !== environmentId)) {
        toastManager.add({
          type: "error",
          title: "Stashed files belong to another environment",
          description: "Restore this prompt in the environment that received its files.",
        });
        return;
      }
      setIsStashMenuOpen(false);

      // The server sweeps pending uploads after 24 hours, so ask before
      // reattaching. An expired upload restores as a needs-reattach row
      // instead of a reference the next send would fail to verify. Verify
      // BEFORE taking: the take removes the entry from durable storage, and a
      // tab closed during this await must still find it there after reload.
      const verifications = await Promise.all(
        filesToVerify.map((file) =>
          verifyStashedAttachmentUpload({ environmentId, attachmentId: file.attachmentId }),
        ),
      );
      const expiredAttachmentIds = new Set(
        filesToVerify
          .filter((_, index) => verifications[index]?.status === "missing")
          .map((file) => file.attachmentId),
      );

      // A thread switch during the verify await would mix the new thread's
      // prompt with this invocation's captured target. Nothing was taken yet,
      // so abort and leave the entry restorable where the user now is.
      if (
        isRevertingCheckpointRef.current ||
        composerTargetKey(composerDraftTarget) !== composerDraftTargetKeyRef.current
      ) {
        return;
      }

      // The take is also the double-activation guard (click + Enter): the
      // second caller finds the entry gone and stops here.
      const { entry, durable } = takeStashEntry(menuEntry.id);
      if (!entry) return;
      if (!durable) {
        toastManager.add({
          type: "warning",
          title: "Restored prompt may reappear in the stash",
          description:
            "Browser storage rejected the update, so this entry could still be there after a reload.",
          data: { hideCopyButton: true },
        });
      }

      const rewrittenContextIds = entry.records
        ? importContextRecords(entry.records, null)
        : new Map<string, string>();
      const restoredPrompt = replaceComposerContextReferences(entry.prompt, (reference) => {
        const contextId = rewrittenContextIds.get(reference.contextId);
        return contextId
          ? formatInlineContextReference({
              ...reference,
              contextId,
              kind: reference.kind === "element" ? "preview-annotation" : reference.kind,
            })
          : reference.source;
      });
      const currentPrompt = promptRef.current;
      // An image-only stash must not append blank lines to whatever is
      // already in the composer.
      const nextPrompt =
        restoredPrompt.length === 0
          ? currentPrompt
          : currentPrompt.trim().length
            ? `${currentPrompt.replace(/\s+$/, "")}\n\n${restoredPrompt}`
            : restoredPrompt;
      let promptChanged = nextPrompt !== currentPrompt;
      if (promptChanged) {
        promptRef.current = nextPrompt;
        setComposerDraftPrompt(composerDraftTarget, nextPrompt);
        setComposerCursor(collapseExpandedComposerCursor(nextPrompt, nextPrompt.length));
        setComposerTrigger(null);
      }

      let unrestoredFileNames: string[] = [];
      const expiredFileNames: string[] = [];
      let restoredFileCount = 0;
      const stashedFiles = entry.files ?? [];
      if (stashedFiles.length > 0) {
        const composerFilesNow = composerFilesRef.current;
        const existingFileIds = new Set(composerFilesNow.map((file) => file.id));
        const retainedUploadIds = new Set(
          composerFilesNow.flatMap((file) =>
            file.uploadedAttachmentId ? [file.uploadedAttachmentId] : [],
          ),
        );
        const existingFileKeys = new Set(composerFilesNow.map(composerFileDedupKey));
        const reattachMarkers = composerFilesNow.filter(composerFileNeedsReattach);
        const restoredMarkerIds = new Set<string>();
        const duplicateFiles: PersistedComposerFileAttachment[] = [];
        const markerReplacements: ComposerFileAttachment[] = [];
        const appendedFiles: ComposerFileAttachment[] = [];
        for (const file of stashedFiles) {
          const expired = expiredAttachmentIds.has(file.attachmentId);
          const key = composerFileDedupKey(file);
          const restored: ComposerFileAttachment = {
            type: "file",
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            file: null,
            ...(file.source ? { source: file.source } : {}),
            // An expired upload carries no ids, so it hydrates as a
            // needs-reattach row and the "Attach again" flow takes over.
            ...(expired
              ? {}
              : { uploadedAttachmentId: file.attachmentId, uploadEnvironmentId: environmentId }),
          };
          if (existingFileIds.has(file.id)) {
            if (!expired && !retainedUploadIds.has(file.attachmentId)) {
              duplicateFiles.push(file);
            }
            continue;
          }
          const reattachMarker = reattachMarkers.find(
            (marker) =>
              !restoredMarkerIds.has(marker.id) && composerFileMatchesReattachMarker(marker, file),
          );
          if (reattachMarker) {
            restoredMarkerIds.add(reattachMarker.id);
            existingFileIds.add(file.id);
            existingFileKeys.add(key);
            if (expired) {
              expiredFileNames.push(file.name);
            } else {
              retainedUploadIds.add(file.attachmentId);
              markerReplacements.push(restored);
            }
            continue;
          }
          if (existingFileKeys.has(key)) {
            if (!expired && !retainedUploadIds.has(file.attachmentId)) {
              duplicateFiles.push(file);
            }
            continue;
          }
          existingFileIds.add(file.id);
          existingFileKeys.add(key);
          if (expired) {
            expiredFileNames.push(file.name);
          } else {
            retainedUploadIds.add(file.attachmentId);
          }
          appendedFiles.push(restored);
        }
        const capacity = Math.max(
          0,
          PROVIDER_SEND_TURN_MAX_ATTACHMENTS -
            composerImagesRef.current.length -
            composerFilesNow.length,
        );
        // Marker replacements reuse their marker's slot; only appended files
        // consume capacity.
        const filesToAppend = appendedFiles.slice(0, capacity);
        const skippedFiles = appendedFiles.slice(capacity);
        unrestoredFileNames = skippedFiles.map((file) => file.name);
        // A non-durable take can resurrect the stash entry after a reload;
        // deleting these uploads would leave it pointing at nothing.
        if (durable) {
          for (const file of duplicateFiles) {
            releasePersistedAttachmentUpload({
              id: file.id,
              environmentId,
              attachmentId: file.attachmentId,
            });
          }
          for (const file of skippedFiles) {
            if (file.uploadedAttachmentId) {
              releasePersistedAttachmentUpload({
                id: file.id,
                environmentId,
                attachmentId: file.uploadedAttachmentId,
              });
            }
          }
        }
        const restoredFiles = [...markerReplacements, ...filesToAppend];
        if (restoredFiles.length > 0) {
          addComposerDraftFiles(composerDraftTarget, restoredFiles, { appendReference: true });
          const restoredFilePrompt = getComposerDraft(composerDraftTarget)?.prompt;
          if (restoredFilePrompt !== undefined && restoredFilePrompt !== promptRef.current) {
            promptRef.current = restoredFilePrompt;
            setComposerCursor(
              collapseExpandedComposerCursor(restoredFilePrompt, restoredFilePrompt.length),
            );
            setComposerTrigger(null);
            promptChanged = true;
          }
          restoredFileCount = filesToAppend.length;
        }
      }

      let unrestoredImageNames: string[] = [];
      if (entry.attachments.length > 0) {
        const existingIds = new Set(composerImagesRef.current.map((image) => image.id));
        // The draft store also dedupes by mimeType+sizeBytes+name, so filter
        // on the same key here. Counting a duplicate against capacity would
        // burn a slot the store then refuses to fill, pushing a genuinely
        // unique image into the overflow list for nothing.
        const existingDedupKeys = new Set(
          composerImagesRef.current.map(
            (image) => `${image.mimeType}\0${image.sizeBytes}\0${image.name}`,
          ),
        );
        const capacity = Math.max(
          0,
          PROVIDER_SEND_TURN_MAX_ATTACHMENTS -
            composerImagesRef.current.length -
            composerFilesRef.current.length -
            restoredFileCount,
        );
        const pending = entry.attachments.filter(
          (attachment) =>
            !existingIds.has(attachment.id) &&
            !existingDedupKeys.has(
              `${attachment.mimeType}\0${attachment.sizeBytes}\0${attachment.name}`,
            ),
        );
        // Anything past the attachment limit cannot be restored. The entry is
        // already out of the queue, so report the overflow by name instead of
        // discarding it silently.
        unrestoredImageNames = pending.slice(capacity).map((attachment) => attachment.name);
        const restoredImages = hydrateImagesFromPersisted(pending.slice(0, capacity));
        if (restoredImages.length > 0) {
          addComposerDraftImages(composerDraftTarget, restoredImages);
        }
      }

      // Deliberately no model/provider restore: the stash exists to carry a
      // prompt across threads and providers, so whatever the composer has
      // selected right now stays selected.

      // Each cause gets its own sentence so "too large" is never blamed for a
      // file that actually failed to decode, or for one the composer simply
      // had no room to take back.
      const missingImageReasons: string[] = [];
      if (entry.droppedImageNames.length > 0) {
        missingImageReasons.push(
          `${entry.droppedImageNames.join(", ")} exceeded the stash size limit when this prompt was saved.`,
        );
      }
      if (entry.unreadableImageNames && entry.unreadableImageNames.length > 0) {
        missingImageReasons.push(
          `${entry.unreadableImageNames.join(", ")} could not be read when this prompt was saved.`,
        );
      }
      if (unrestoredImageNames.length > 0) {
        missingImageReasons.push(
          `${unrestoredImageNames.join(", ")} could not be restored: the composer is at its ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS}-attachment limit.`,
        );
      }
      if (unrestoredFileNames.length > 0) {
        missingImageReasons.push(
          `${unrestoredFileNames.join(", ")} could not be restored: the composer is at its ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS}-attachment limit.`,
        );
      }
      if (expiredFileNames.length > 0) {
        missingImageReasons.push(
          `${expiredFileNames.join(", ")}: stashed files are kept for 24 hours and this upload expired. Attach the file again.`,
        );
      }
      if (missingImageReasons.length > 0) {
        toastManager.add({
          type: "warning",
          title: "Some attachments were not restored",
          description: missingImageReasons.join(" "),
        });
      }

      // Only yank the caret to the end when text was actually inserted;
      // restoring images alone should leave the user where they were typing.
      if (promptChanged) {
        window.requestAnimationFrame(() => {
          composerEditorRef.current?.focusAtEnd();
        });
      }
    },
    [
      addComposerDraftFiles,
      addComposerDraftImages,
      composerDraftTarget,
      composerFilesRef,
      composerImagesRef,
      environmentId,
      promptRef,
      setComposerDraftPrompt,
      setComposerTrigger,
      takeStashEntry,
      importContextRecords,
    ],
  );

  const deleteStashEntry = useCallback(
    (entry: PromptStashEntry) => {
      const { entry: removed, durable } = takeStashEntry(entry.id);
      if (!stashQueue.some((candidate) => candidate.id !== entry.id)) {
        setIsStashMenuOpen(false);
      }
      if (durable && removed) {
        for (const file of removed.files ?? []) {
          releasePersistedAttachmentUpload({
            id: file.id,
            environmentId: file.environmentId,
            attachmentId: file.attachmentId,
          });
        }
      }
      if (!durable) {
        toastManager.add({
          type: "warning",
          title: "Stash entry may come back",
          description:
            "Browser storage rejected the delete, so this prompt could reappear after a reload.",
          data: { hideCopyButton: true },
        });
      }
    },
    [stashQueue, takeStashEntry],
  );

  const stashCurrentPrompt = useCallback(async () => {
    // Stashing clears the draft. A pasted attachment still downloading would then land in the
    // emptied composer instead of travelling with the entry it belongs to.
    if (pendingDraftWork.has(attachmentTargetKeyRef.current)) {
      toastManager.add({
        type: "info",
        title: "Still bringing a pasted attachment into this message.",
        description: "Stash again once its chip resolves.",
      });
      return;
    }
    const prompt = promptRef.current.trim();
    const images = [...composerImagesRef.current];
    const files = [...composerFilesRef.current];
    // Context chips keep their links in the prompt; the payloads behind them travel as
    // records so the restore can resolve every chip.
    const stashedRecords: ComposerContextRecord[] = [
      ...composerTerminalContextsRef.current.map(terminalContextRecord),
      ...composerReviewComments.map(reviewCommentContextRecord),
      ...composerPreviewAnnotations.map((annotation) =>
        previewAnnotationContextRecord(annotation, {
          screenshotContextId: images.some((image) => image.id === annotation.id)
            ? annotation.id
            : undefined,
        }),
      ),
    ];
    if (prompt.length === 0 && images.length === 0 && files.length === 0) {
      const entries = usePromptStashStore.getState().entries;
      const entry = entries.length === 1 ? entries[0] : undefined;
      if (entry && !entry.pendingImageCount) {
        await restoreStashEntry(entry);
      } else {
        setIsStashMenuOpen((open) => !open);
      }
      return;
    }
    const stashedFiles: PersistedComposerFileAttachment[] = [];
    for (const file of files) {
      if (composerFileNeedsReattach(file)) {
        toastManager.add({
          type: "error",
          title: "Attach dropped files again or remove them before stashing",
        });
        return;
      }
      const upload = readAttachmentUpload(file.id);
      if (upload?.status !== "ready" || upload.environmentId !== environmentId) {
        toastManager.add({
          type: "error",
          title: "Wait for file uploads before stashing this prompt",
        });
        return;
      }
      stashedFiles.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        attachmentId: upload.attachmentId,
        environmentId,
        ...(file.source ? { source: file.source } : {}),
      });
    }
    // A repeat ⌘S on the *same* still-unencoded snapshot would stash it
    // twice. Guard on the snapshot itself rather than a bare boolean: once
    // the composer has been cleared the user can type something genuinely
    // new (or switch threads) while encoding continues, and that deserves its
    // own entry.
    const attachmentKey = images
      .map((image) => `image:${image.id}`)
      .concat(files.map((file) => `file:${file.id}`))
      .join(",");
    const snapshotKey = [String(composerDraftTarget), prompt, attachmentKey].join("\n");
    if (stashInFlightRef.current.has(snapshotKey)) return;
    stashInFlightRef.current.add(snapshotKey);

    const stashTarget = composerDraftTarget;
    const entryId = randomUUID();
    try {
      // Persist the text-only entry *first*, then clear. Ordering matters in
      // both directions: writing before clearing means a crash or closed tab
      // mid-encode still leaves the prompt recoverable, while clearing before
      // the async image work means edits typed during encoding are not wiped.
      // Images are appended to the stored entry as they finish encoding.
      const { evicted, written, durable } = stashEntryToQueue({
        id: entryId,
        createdAt: new Date().toISOString(),
        prompt,
        attachments: [],
        ...(stashedFiles.length > 0 ? { files: stashedFiles } : {}),
        droppedImageNames: [],
        unreadableImageNames: [],
        pendingImageCount: images.length,
        ...(stashedRecords.length > 0 ? { records: stashedRecords } : {}),
      });

      // Clearing the composer is only safe once the write actually landed.
      // If it was rejected (quota) the store has already rolled itself back,
      // so leave the composer untouched rather than making it the second
      // casualty of a reload.
      if (!written) {
        toastManager.add({
          type: "error",
          title: "Could not stash this prompt",
          description:
            "Browser storage rejected the write, so the composer was left as-is. Free up site data and try again.",
          data: { hideCopyButton: true },
        });
        return;
      }
      // Written but only into the in-memory fallback (localStorage blocked):
      // the entry is visible and restorable this session, so proceed with the
      // clear, but say it won't survive a reload.
      if (!durable) {
        toastManager.add({
          type: "warning",
          title: "Stashed prompt will not survive a reload",
          description:
            "Browser storage is unavailable, so this stash is kept in memory only for this session.",
          data: { hideCopyButton: true },
        });
      }

      // Everything the entry carries leaves the draft with it.
      promptRef.current = "";
      clearComposerDraftPromptAndImages(stashTarget);
      clearComposerDraftTerminalContexts(stashTarget);
      for (const comment of composerReviewComments) {
        removeComposerDraftReviewComment(stashTarget, comment.id);
      }
      for (const annotation of composerPreviewAnnotations) {
        releaseAttachmentUpload(annotation.id);
        removeComposerDraftPreviewAnnotation(stashTarget, annotation.id);
      }
      setComposerDraftPrompt(stashTarget, "");
      for (const image of images) {
        releaseAttachmentUpload(image.id);
      }
      setComposerCursor(0);
      setComposerTrigger(null);
      pulseStashBadge();

      if (evicted) {
        for (const file of evicted.files ?? []) {
          releasePersistedAttachmentUpload({
            id: file.id,
            environmentId: file.environmentId,
            attachmentId: file.attachmentId,
          });
        }
        toastManager.add({
          type: "warning",
          title: "Oldest stashed prompt discarded",
          description: `The stash holds ${MAX_STASH_ENTRIES} prompts; the oldest was removed to make room.`,
          data: { hideCopyButton: true },
        });
      }

      // Images are re-encoded for the stash rather than stored verbatim: the
      // composer allows up to 10MB per image, but localStorage gives the whole
      // origin ~5MB. Only the stashed copy shrinks; the live attachment (and
      // anything sent without stashing) keeps the original file.
      const candidateAttachments: PersistedComposerImageAttachment[] = [];
      const oversizedImageNames: string[] = [];
      const unreadableImageNames: string[] = [];
      for (const image of images) {
        const result = await compressImageForStash(image.file);
        if (!result.ok) {
          // "too large" and "could not be read" are distinct outcomes; the
          // menu and restore toast report them separately.
          (result.reason === "too-large" ? oversizedImageNames : unreadableImageNames).push(
            image.name,
          );
          continue;
        }
        candidateAttachments.push({
          id: image.id,
          name: image.name,
          mimeType: result.image.mimeType,
          sizeBytes: result.image.sizeBytes,
          dataUrl: result.image.dataUrl,
          ...(image.source
            ? { source: resizeSnapShotSource(image.source, result.image.imageSize) }
            : {}),
        });
      }
      const { kept, droppedNames } = partitionStashAttachments(candidateAttachments);

      const { attached, durable: imagesDurable } = finalizeStashEntryImages(entryId, {
        attachments: kept,
        droppedImageNames: [...oversizedImageNames, ...droppedNames],
        unreadableImageNames,
      });
      if (attached) {
        // The second phase can be rejected on its own: the text-only entry
        // fit, but adding image payloads pushed past the quota. Disk would
        // then still hold the phase-one entry with pendingImageCount set,
        // which reads as an orphan after reload — so say so now. Gated on the
        // entry write having been durable: on the in-memory fallback nothing
        // is ever durable, and the session-only warning already covered it.
        if (!imagesDurable && durable && images.length > 0) {
          toastManager.add({
            type: "warning",
            title: "Stashed images were not saved",
            description:
              "The prompt was stashed, but browser storage rejected its images. They will be missing if you reload.",
            data: { hideCopyButton: true },
          });
        }
      } else if (kept.length > 0) {
        // The entry was restored or deleted before its images finished
        // encoding, so they have nowhere to land. Say so rather than letting
        // them evaporate.
        toastManager.add({
          type: "warning",
          title: "Stashed images did not attach",
          description: `That prompt was restored or deleted before ${kept.length} image${kept.length === 1 ? "" : "s"} finished saving. Re-attach ${kept.length === 1 ? "it" : "them"} if you still need ${kept.length === 1 ? "it" : "them"}.`,
          data: { hideCopyButton: true },
        });
      }
    } finally {
      // Must clear on every path: a throw that left this set would wedge this
      // snapshot's ⌘S until the composer remounts.
      stashInFlightRef.current.delete(snapshotKey);
    }
  }, [
    clearComposerDraftPromptAndImages,
    clearComposerDraftTerminalContexts,
    setComposerDraftPrompt,
    setComposerTrigger,
    composerDraftTarget,
    composerFilesRef,
    composerImagesRef,
    composerTerminalContextsRef,
    composerReviewComments,
    composerPreviewAnnotations,
    removeComposerDraftReviewComment,
    removeComposerDraftPreviewAnnotation,
    environmentId,
    finalizeStashEntryImages,
    promptRef,
    pulseStashBadge,
    restoreStashEntry,
    stashEntryToQueue,
  ]);

  const toggleStashMenu = useCallback(() => {
    setIsStashMenuOpen((open) => !open);
  }, []);
  const toggleTasksDrawer = useCallback(() => {
    setIsTasksDrawerOpen((open) => !open);
  }, []);
  const hasBannerItems = props.bannerItems.length > 0;
  const hasBlockingComposerTopDrawer =
    activePendingApproval !== null || pendingUserInputs.length > 0;
  const showInlineTasksBadge =
    activeTasksProgress !== null &&
    activeTaskSteps !== null &&
    !isTasksDrawerOpen &&
    !hasBlockingComposerTopDrawer &&
    (hasBannerItems || showComposerTopDrawer);
  const inlineTasksBadge = showInlineTasksBadge ? (
    <ComposerTasksBadge
      expanded={false}
      onToggle={toggleTasksDrawer}
      placement="inline"
      progress={activeTasksProgress}
      steps={activeTaskSteps}
    />
  ) : null;

  // ------------------------------------------------------------------
  // Metadata line: the project, then only what differs from the defaults
  // ------------------------------------------------------------------
  const inPane = usePaneContext().paneId !== null;
  const composerProjectRef = useMemo(() => {
    const owner = activeThread ?? props.activeThreadShell;
    return owner ? scopeProjectRef(owner.environmentId, owner.projectId) : null;
  }, [activeThread, props.activeThreadShell]);
  const composerProject = useProject(composerProjectRef);
  const defaultRuntimeMode = resolveProjectSettings(settings, composerProject?.id ?? null).settings
    .defaultRuntimeMode;
  // The configured default for the primary option (reasoning effort): the
  // project default's saved value for this instance, else the model's own. A
  // thread still at that value carries no effort segment.
  const configuredDefaultOptions =
    activeProjectDefaultModelSelection?.instanceId === selectedInstanceId
      ? activeProjectDefaultModelSelection.options
      : undefined;
  const defaultPromptEffort = useMemo(() => {
    const caps = getProviderModelCapabilities(
      selectedProviderModels,
      selectedModel,
      selectedProvider,
      settings.planModeEnabled,
    );
    const descriptor = getProviderOptionDescriptors({
      caps,
      selections: configuredDefaultOptions,
    }).find((candidate) => candidate.type === "select");
    const value = getProviderOptionCurrentValue(descriptor);
    return typeof value === "string" ? value : null;
  }, [
    configuredDefaultOptions,
    selectedModel,
    selectedProvider,
    selectedProviderModels,
    settings.planModeEnabled,
  ]);
  const metadataSegments = new Set(
    resolveComposerMetadataSegments({
      inPane,
      interactionMode: planModeUiEnabled ? interactionMode : "default",
      runtimeMode,
      defaultRuntimeMode,
      effortChanged: selectedPromptEffort !== null && selectedPromptEffort !== defaultPromptEffort,
      stashed: stashQueue.length > 0 && !isComposerApprovalState,
      // The branch toolbar renders the host, worktree and branch segments.
      otherHost: false,
      worktree: false,
      hasBranch: false,
    }),
  );
  const providerTraitsSegment = renderProviderTraitsPicker({
    ...providerTraitsPickerInput,
    size: "xs",
  });
  const modelSegment = showProviderUnavailable ? (
    <ComposerControl
      size="xs"
      disabled={!providerSetupInstanceId}
      onClick={() => {
        if (providerSetupInstanceId) {
          onOpenProviderSetup(providerSetupInstanceId);
        }
      }}
      data-chat-provider-unavailable="true"
    >
      <CircleAlertIcon />
      {providerSetupInstanceId ? "Open provider settings" : "No provider available"}
    </ComposerControl>
  ) : (
    <ProviderModelPicker
      isComposerOwned
      disabled={providerCatalogPending || isSendBusy}
      {...(routeKind === "draft" && supportsMultipleModels
        ? {
            ...(multipleModelSelections !== null
              ? { selectedModels: multipleModelSelections }
              : {}),
            onToggleModel: (instanceId: ProviderInstanceId, model: string) => {
              const current = multipleModelSelections ?? [selectedModelSelection];
              const matchesModel = (selection: ModelSelection) => {
                if (selection.instanceId !== instanceId) return false;
                const entry = providerInstanceEntries.find(
                  (entry) => entry.instanceId === selection.instanceId,
                );
                const resolvedModel = resolveModelPickerSelectedModel({
                  driverKind: entry?.driverKind,
                  model: selection.model,
                  options: modelOptionsByInstance.get(selection.instanceId) ?? [],
                });
                return (resolvedModel?.slug ?? selection.model) === model;
              };
              const exists = current.some(matchesModel);
              const next = exists
                ? current.filter((selection) => !matchesModel(selection))
                : [...current, createModelSelection(instanceId, model)];
              if (next.length > 1) {
                setMultipleModelSelections(next);
              } else {
                setMultipleModelSelections(null);
                const remaining = next[0] ?? selectedModelSelection;
                onProviderModelSelect(remaining.instanceId, remaining.model, {
                  focusComposer: false,
                });
              }
            },
          }
        : {})}
      activeInstanceId={
        providerCatalogPending
          ? (activeThreadModelSelection?.instanceId ?? selectedInstanceId)
          : selectedInstanceId
      }
      model={
        providerCatalogPending
          ? (activeThreadModelSelection?.model ?? selectedModelForPickerWithCustomFallback)
          : selectedModelForPickerWithCustomFallback
      }
      lockedProvider={lockedProvider}
      lockedContinuationGroupKey={lockedContinuationGroupKey}
      instanceEntries={providerInstanceEntries}
      keybindings={keybindings}
      modelOptionsByInstance={modelOptionsByInstance}
      size="xs"
      triggerClassName="min-w-0"
      terminalOpen={terminalOpen}
      open={isComposerModelPickerOpen}
      instanceIndicatorBackground="var(--background)"
      {...(composerProviderState.modelPickerIconClassName
        ? { activeProviderIconClassName: composerProviderState.modelPickerIconClassName }
        : {})}
      onOpenChange={setIsComposerModelPickerOpen}
      getModelDisabledReason={getModelDisabledReason}
      onInstanceModelChange={(instanceId, model) => {
        setMultipleModelSelections(null);
        onProviderModelSelect(instanceId, model);
      }}
      onOpenProviderSetup={onOpenProviderSetup}
    />
  );
  const showsModelSegment = showProviderUnavailable || metadataSegments.has("model");
  const showsEffortSegment = metadataSegments.has("effort");
  const metadataSlot = useComposerMetadataSlot();
  // Send appears once there is something to send; stop, answers and plan
  // actions whenever they apply. An idle, empty prompt line shows no action.
  const showsPrimaryActions =
    phase === "running" ||
    pendingPrimaryAction !== null ||
    showPlanFollowUpPrompt ||
    composerSendState.hasSendableContent ||
    isSendBusy ||
    isConnecting;
  const showTasksTab =
    !hasBannerItems &&
    !showComposerTopDrawer &&
    !isTasksDrawerOpen &&
    activeTasksProgress !== null &&
    activeTaskSteps !== null &&
    activeTasksProgress.totalSteps > 0;
  const activityStackContent = hasBannerItems ? (
    shownSyncPhase ? (
      <ComposerActivityRow phase={shownSyncPhase} />
    ) : !hasBlockingComposerTopDrawer && activeTasksProgress && activeTaskSteps ? (
      <ComposerTasksContent
        expanded={isTasksDrawerOpen}
        onToggle={toggleTasksDrawer}
        progress={activeTasksProgress}
        steps={activeTaskSteps}
      />
    ) : null
  ) : null;
  const activityStackItem: ComposerBannerStackContent | null = activityStackContent
    ? {
        id: "composer-activity",
        variant: "default",
        priority: "activity",
        content: activityStackContent,
      }
    : null;
  const bannerStackItems = activityStackItem
    ? [activityStackItem, ...props.bannerItems]
    : props.bannerItems;
  useEffect(() => {
    if (activeTasksProgress === null || activeTaskSteps === null) {
      setIsTasksDrawerOpen(false);
    }
  }, [activeTaskSteps, activeTasksProgress]);

  useEffect(() => {
    if (hasBlockingComposerTopDrawer) {
      setIsTasksDrawerOpen(false);
    }
  }, [hasBlockingComposerTopDrawer]);

  useEffect(() => {
    setIsTasksDrawerOpen(false);
  }, [activeThreadId]);

  // Close the stash menu whenever the trigger-driven command menu opens so
  // the two popovers never stack in the same layer, and when the user
  // resumes typing (the menu is a transient picker, not a panel).
  useEffect(() => {
    if (composerMenuOpen) {
      setIsStashMenuOpen(false);
    }
  }, [composerMenuOpen]);
  useEffect(() => {
    setIsStashMenuOpen(false);
  }, [prompt]);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: getTerminalFocusOwner() !== null,
          terminalOpen,
          modelPickerOpen: isComposerModelPickerOpen,
        },
      });
      if (command !== "composer.stash") return;
      // Always claim the shortcut so the browser save dialog never opens,
      // even when the composer is in a state that can't stash.
      event.preventDefault();
      event.stopPropagation();
      if (isCommandPaletteOpen() || isRevertingCheckpoint) {
        return;
      }
      if (pendingUserInputs.length > 0 && !isComposerApprovalState) {
        setIsStashMenuOpen((open) => !open);
        return;
      }
      if (isComposerApprovalState || projectSelectionRequired || activePendingProgress !== null) {
        return;
      }
      void stashCurrentPrompt();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [
    activePendingProgress,
    isComposerApprovalState,
    isComposerModelPickerOpen,
    keybindings,
    pendingUserInputs.length,
    projectSelectionRequired,
    stashCurrentPrompt,
    isRevertingCheckpoint,
    terminalOpen,
  ]);

  // ------------------------------------------------------------------
  // Callbacks: attachments
  // ------------------------------------------------------------------
  const countReservedAttachments = () => {
    const questionRequest = pendingUserInputs[0];
    const otherQuestionKeys =
      questionAttachmentTarget && questionRequest && activeThreadId
        ? questionRequest.questions
            .map((question) =>
              questionAttachmentDraftId(
                environmentId,
                activeThreadId,
                questionRequest.requestId,
                question.id,
              ),
            )
            .filter((key) => key !== questionAttachmentTarget)
        : [];
    return (
      composerImagesRef.current.length +
      composerFilesRef.current.length +
      (pendingImageCompressionsRef.current.get(attachmentTargetKey) ?? 0) +
      countQuestionAttachments(otherQuestionKeys)
    );
  };
  /** Resolves true when at least one chip was inserted for the accepted attachments. */
  const addComposerAttachments = async (
    files: File[],
    options?: {
      readonly source?: ChatFileAttachment["source"];
      readonly selection?: { start: number; end: number };
      readonly skipImageInlineChip?: boolean;
    },
  ): Promise<boolean> => {
    if (!activeThreadId || files.length === 0 || isRevertingCheckpointRef.current) return false;
    if (
      pendingUserInputs.length > 0 &&
      (!supportsQuestionAttachments ||
        activePendingProgress?.activeQuestion?.allowCustomAnswer === false ||
        activePendingIsResponding)
    ) {
      toastManager.add({
        type: "error",
        title: "This question cannot accept attachments.",
      });
      return false;
    }
    // Captured before the awaits below: the user may switch threads while a
    // large image is being compressed, and the attachments and errors belong
    // to the thread the paste happened in.
    const threadId = activeThreadId;
    // Images landing with no prose live on the shelf with no chip. Read before
    // the awaits below: compression is async and the prompt may change while it
    // runs. An explicit selection replace and states where the editor refuses
    // input (connecting, pending questions, project selection) still
    // get chips so the image is never invisible, unless paste-as-text explicitly
    // requests no inline image chip.
    const imageAttachmentsGetChips =
      !options?.skipImageInlineChip &&
      (options?.selection !== undefined ||
        isConnecting ||
        pendingUserInputs.length > 0 ||
        projectSelectionRequired ||
        stripInlineContextReferences(promptRef.current).trim().length > 0);

    // Validation happens synchronously so concurrent pastes see each other:
    // accepted files reserve their attachment slots (via the pending counter)
    // before the first await, keeping the total under the limit.
    const pendingCount = pendingImageCompressionsRef.current.get(attachmentTargetKey) ?? 0;
    let reservedCount = countReservedAttachments();
    // A pick that matches a needs-reattach marker replaces it in the draft, so
    // it must not consume a slot; a draft full of markers would otherwise hit
    // the capacity error before the replacement path could run.
    const reattachMarkers = composerFilesRef.current.filter(composerFileNeedsReattach);
    const replacedReattachMarkerIds = new Set<string>();
    const acceptedImages: File[] = [];
    const acceptedFiles: ComposerFileAttachment[] = [];
    let error: string | null = null;
    for (const file of files) {
      const attachmentKind = classifyComposerAttachmentFile(file);
      const fileMimeType =
        attachmentKind === "file"
          ? (videoMimeType({ name: file.name, mimeType: file.type }) ??
            (file.type || "application/octet-stream"))
          : file.type;
      const matchingReattachMarker =
        attachmentKind === "file"
          ? reattachMarkers.find(
              (marker) =>
                !replacedReattachMarkerIds.has(marker.id) &&
                composerFileMatchesReattachMarker(marker, {
                  name: file.name || "file",
                  mimeType: fileMimeType,
                  sizeBytes: file.size,
                }),
            )
          : undefined;
      if (matchingReattachMarker) {
        replacedReattachMarkerIds.add(matchingReattachMarker.id);
      }
      if (!matchingReattachMarker && reservedCount >= PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
        error = `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} files per message.`;
        // Keep scanning: a later file in this batch can still replace a
        // needs-reattach marker without needing a free slot.
        continue;
      }
      if (attachmentKind === "unsupported-image") {
        error = `'${file.name}' is not a supported image type. Attach GIF, HEIC, HEIF, JPEG, PNG, or WebP images.`;
        continue;
      }
      if (attachmentKind === "image") {
        acceptedImages.push(normalizeComposerImageFileMimeType(file));
      } else {
        if (fileStagingLimit === null) {
          error = "This server does not support file attachments.";
          continue;
        }
        if (file.size <= 0) {
          error = `'${file.name}' is empty or could not be read.`;
          continue;
        }
        if (file.size > fileStagingLimit) {
          error = fileAttachmentTooLargeMessage(file.name, fileStagingLimit);
          continue;
        }
        const attachmentFile =
          file.type === fileMimeType
            ? file
            : new File([file], file.name, { type: fileMimeType, lastModified: file.lastModified });
        acceptedFiles.push({
          type: "file",
          id: randomUUID(),
          name: attachmentFile.name || "file",
          mimeType: fileMimeType,
          sizeBytes: attachmentFile.size,
          file: attachmentFile,
          ...(options?.source ? { source: options.source } : {}),
        });
      }
      if (!matchingReattachMarker) {
        reservedCount += 1;
      }
    }
    setThreadError(threadId, error);
    let insertedAny = false;
    if (acceptedFiles.length > 0) {
      // Only files the draft actually took get a chip; a duplicate is deduped by the store
      // and a chip for it would point at nothing.
      const storedIds = new Set(addComposerFilesToDraft(acceptedFiles));
      const storedFiles = acceptedFiles.filter((file) => storedIds.has(file.id));
      if (storedFiles.length > 0) {
        insertedAny = insertAttachmentReferences(
          storedFiles.map(fileContextReference),
          options?.selection,
        );
      }
      if (options?.source?._tag === "pasted-text" && storedFiles.length > 0) {
        const attached = storedFiles[0]!;
        toastManager.add({
          type: "info",
          title: `Large paste attached as ${attached.name}`,
          description: `${formatAttachmentSize(attached.sizeBytes)} · Use ${
            isMacPlatform(navigator.platform) ? "⌘⇧V" : "Ctrl+Shift+V"
          } to keep a large paste inline.`,
          data: { hideCopyButton: true },
        });
      }
    }
    if (acceptedImages.length === 0) return insertedAny;

    pendingImageCompressionsRef.current.set(
      attachmentTargetKey,
      pendingCount + acceptedImages.length,
    );
    if (questionAttachmentTarget)
      changeQuestionAttachmentPreparation(questionAttachmentTarget, acceptedImages.length);
    try {
      const nextImages: ComposerImageAttachment[] = [];
      let compressionError: string | null = null;
      for (const file of acceptedImages) {
        // Images over the wire cap are downscaled to fit rather than
        // refused; files already within it pass through byte-for-byte.
        const compressed = await prepareImageForAttachment(
          file,
          PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
        );
        if (!compressed.ok) {
          compressionError =
            compressed.reason === "unreadable"
              ? `'${file.name}' could not be read as an image.`
              : `'${file.name}' is too large to attach, even after compression.`;
          continue;
        }
        const attachmentFile = compressed.file;
        const previewUrl = URL.createObjectURL(attachmentFile);
        nextImages.push({
          type: "image",
          id: randomUUID(),
          name: attachmentFile.name || "image",
          mimeType: attachmentFile.type,
          sizeBytes: attachmentFile.size,
          previewUrl,
          file: attachmentFile,
        });
      }
      if (
        questionAttachmentTarget &&
        !useQuestionAttachmentPreparation.getState().counts[questionAttachmentTarget]
      ) {
        for (const image of nextImages) URL.revokeObjectURL(image.previewUrl);
        return false;
      }
      const storedImageIds = new Set(
        nextImages.length === 1 && nextImages[0]
          ? addComposerImage(nextImages[0])
          : nextImages.length > 1
            ? addComposerImagesToDraft(nextImages)
            : [],
      );
      const storedImages = nextImages.filter((image) => storedImageIds.has(image.id));
      if (storedImages.length > 0 && imageAttachmentsGetChips) {
        insertedAny =
          insertAttachmentReferences(storedImages.map(imageContextReference)) || insertedAny;
      }
      // Only failures are reported here. Success must not pass `null`: by
      // now other work (a failed send, an overlapping paste) may have set a
      // thread error this call knows nothing about, and clearing it would
      // swallow that message.
      if (compressionError !== null) {
        setThreadError(threadId, compressionError);
      }
    } finally {
      if (questionAttachmentTarget)
        changeQuestionAttachmentPreparation(questionAttachmentTarget, -acceptedImages.length);
      const remaining =
        (pendingImageCompressionsRef.current.get(attachmentTargetKey) ?? 0) - acceptedImages.length;
      if (remaining > 0) {
        pendingImageCompressionsRef.current.set(attachmentTargetKey, remaining);
      } else {
        pendingImageCompressionsRef.current.delete(attachmentTargetKey);
      }
    }
    return insertedAny;
  };

  /**
   * Chips for freshly attached files land at the caret; when the editor cannot take
   * input (approval, pending questions) they are appended so the file is never invisible.
   * Images skip this when they land with no prose and the editor takes input:
   * the shelf thumbnail is enough.
   */
  const insertAttachmentReferences = (
    references: ReadonlyArray<ComposerContextReference>,
    selection?: { start: number; end: number },
  ): boolean => {
    if (references.length === 0) return false;
    // Question answers carry attachments beside the answer, never as chips. Falling back to
    // the thread prompt here would hide the file behind a reference the question never shows.
    if (questionAttachmentTarget) return false;
    if (selection) {
      const edit = inlineContextReferenceReplacement(promptRef.current, selection, references);
      return applyPromptReplacement(edit.start, edit.end, edit.text);
    }
    const text = references.map(formatInlineContextReference).join(" ");
    const inserted = insertComposerText(`${text} `, "cursor", { ensureLeadingBoundary: true });
    if (!inserted) {
      setPrompt(ensureInlineContextReferences(promptRef.current, references));
    }
    return true;
  };

  const removeComposerImage = (imageId: string) => {
    const image = composerImagesRef.current.find((candidate) => candidate.id === imageId);
    const referenced = collectInlineContextIds(promptRef.current).includes(
      image ? imageContextReference(image).contextId : "",
    );
    if (!referenced) {
      removeComposerImageFromDraft(imageId);
      return;
    }
    const confirmation = requestConfirmDialog(
      `Remove ${image?.name ?? "this image"} from the message?\nIt is referenced in your text; removing it also removes every reference.`,
      { variant: "destructive" },
    );
    if (!confirmation) {
      removeComposerImageFromDraft(imageId);
      return;
    }
    void confirmation.then((confirmed) => {
      if (confirmed) removeComposerImageFromDraft(imageId);
    });
  };

  // ------------------------------------------------------------------
  // Callbacks: paste / drag
  // ------------------------------------------------------------------
  const foldPastedText = (
    plainText: string,
    bypassAutoAttachment: boolean,
    selectionOverride?: { start: number; end: number },
  ): boolean => {
    const questionCanAttach =
      pendingUserInputs.length === 0 ||
      (supportsQuestionAttachments &&
        activePendingProgress?.activeQuestion?.allowCustomAnswer !== false &&
        !activePendingIsResponding);
    const hasAttachmentSlot = countReservedAttachments() < PROVIDER_SEND_TURN_MAX_ATTACHMENTS;
    const selection = selectionOverride ?? composerEditorRef.current?.readSelectionRange();
    const wouldExceedInputLimit = wouldTextPasteExceedLimit({
      valueLength: promptRef.current.length,
      selection: selection ?? { start: 0, end: 0 },
      textLength: plainText.length,
      maxLength: PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
    });
    const shouldFold =
      pastedTextDisposition({
        text: plainText,
        bypassAutoAttachment,
        wouldExceedInputLimit,
        canAttach: true,
      }) === "attachment";
    if (!shouldFold) {
      return false;
    }

    const canStageAttachment =
      Boolean(activeThreadId) &&
      !isRevertingCheckpointRef.current &&
      questionCanAttach &&
      hasAttachmentSlot;
    if (!canStageAttachment || fileStagingLimit === null) {
      if (!wouldExceedInputLimit) {
        return false;
      }
      toastManager.add({
        type: "error",
        title: "Pasted text is too large for this message",
        description: "Remove some text or an attachment, then paste again.",
        data: { hideCopyButton: true },
      });
      return true;
    }

    if (pastedTextFileNamesRef.current.targetKey !== attachmentTargetKey) {
      pastedTextFileNamesRef.current = { targetKey: attachmentTargetKey, names: new Set() };
    }
    const reservedNames = pastedTextFileNamesRef.current.names;
    for (const file of composerFilesRef.current) reservedNames.add(file.name);
    const foldedFileName = nextPastedTextFileName([...reservedNames]);
    reservedNames.add(foldedFileName);
    const foldedFile = new File([plainText], foldedFileName, {
      type: "text/plain;charset=utf-8",
    });
    if (foldedFile.size > fileStagingLimit) {
      reservedNames.delete(foldedFileName);
      if (!wouldExceedInputLimit) return false;
      toastManager.add({
        type: "error",
        title: "Pasted text is too large to attach",
        description: "Reduce the clipboard contents or save a smaller excerpt as a file.",
        data: { hideCopyButton: true },
      });
      return true;
    }

    void addComposerAttachments([foldedFile], {
      source: { _tag: "pasted-text" },
      ...(selection ? { selection } : {}),
    });
    return true;
  };

  const onComposerPaste = (event: React.ClipboardEvent<HTMLElement>) => {
    const files = Array.from(event.clipboardData.files);
    const plainText = event.clipboardData.getData("text/plain");
    const bypassAutoAttachment = Date.now() <= pasteAsTextShortcutUntilRef.current;
    pasteAsTextShortcutUntilRef.current = 0;
    // Claimable pastes go through even when agent questions are pending or the
    // composer is at its attachment limit: `addComposerAttachments` surfaces
    // those as a toast and a thread error. An early return here would swallow
    // the paste with no feedback.
    if (
      files.length > 0 &&
      activeThreadId &&
      shouldHandleComposerAttachmentPaste({ files, plainText })
    ) {
      event.preventDefault();
      event.stopPropagation();
      void addComposerAttachments(files, { skipImageInlineChip: bypassAutoAttachment });
      return;
    }

    // Copied T3 chips need the structured importer to bring their records and files along.
    if ((readPastedComposerContext(event.clipboardData)?.records.length ?? 0) > 0) return;
    if (!foldPastedText(plainText, bypassAutoAttachment)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const insertComposerText = useCallback(
    (
      text: string,
      position: "cursor" | "end",
      options?: {
        ensureLeadingBoundary?: boolean;
        citationCommentAnchor?: AssistantCitationSourceAnchor;
        clipboardData?: DataTransfer;
      },
    ): boolean => {
      if (
        text.length === 0 ||
        isConnecting ||
        pendingUserInputs.length > 0 ||
        projectSelectionRequired ||
        (options?.citationCommentAnchor && !composerEditorRef.current)
      ) {
        return false;
      }
      if (options?.clipboardData) {
        text = importPastedComposerText(options.clipboardData, importContextFragment);
      }
      const prompt = promptRef.current;
      const cursor = position === "cursor" ? readComposerSnapshot().expandedCursor : prompt.length;
      const needsLeadingSpace =
        (options?.ensureLeadingBoundary ?? false) &&
        cursor > 0 &&
        !/\s/.test(prompt[cursor - 1] ?? "");
      const rangeEnd = extendReplacementRangeForTrailingSpace(prompt, cursor, text);
      return applyPromptReplacement(
        cursor,
        rangeEnd,
        needsLeadingSpace ? ` ${text}` : text,
        options?.citationCommentAnchor
          ? {
              citationComment: {
                start: cursor + (needsLeadingSpace ? 1 : 0),
                sourceAnchor: options.citationCommentAnchor,
              },
              focusEditorAfterReplace: false,
            }
          : undefined,
      );
    },
    [
      applyPromptReplacement,
      isConnecting,
      pendingUserInputs.length,
      projectSelectionRequired,
      promptRef,
      readComposerSnapshot,
      importContextFragment,
    ],
  );

  const insertComposerTextAtEnd = useCallback<ChatComposerHandle["insertTextAtEnd"]>(
    (text, options) => insertComposerText(text, "end", options),
    [insertComposerText],
  );

  // Context produced by other panels (diff comments, preview picks) asks the store to place
  // its chip; while this composer is mounted for the draft, that means the caret.
  const insertContextReferencesAtCaret = useCallback(
    (references: ReadonlyArray<ComposerContextReference>): boolean =>
      insertComposerText(`${references.map(formatInlineContextReference).join(" ")} `, "cursor", {
        ensureLeadingBoundary: true,
      }),
    [insertComposerText],
  );
  const setContextInsertionHandler = useComposerDraftStore(
    (store) => store.setContextInsertionHandler,
  );
  useEffect(() => {
    return setContextInsertionHandler(composerDraftTarget, insertContextReferencesAtCaret);
  }, [composerDraftTarget, insertContextReferencesAtCaret, setContextInsertionHandler]);

  // File-tree drags land as mentions. Handled in the capture phase so the
  // editor never sees the drop; the load-bearing rules (native stop, "move"
  // effect, no eager focus) live in makeComposerMentionDragHandlers.
  const composerMentionDragHandlers = makeComposerMentionDragHandlers({
    insertMentionAtEnd: (text) => insertComposerTextAtEnd(text, { ensureLeadingBoundary: true }),
    setDragActive: setIsDragOverComposer,
    onInsertRejected: () => {
      toastManager.add({
        type: "error",
        title: "Unable to add to chat",
        description: "The composer is busy; try again once it is ready.",
      });
    },
  });

  const onComposerMentionDragLeaveCapture = (event: React.DragEvent<HTMLFormElement>) => {
    if (!dataTransferHasComposerMention(event.dataTransfer.types)) return;
    event.stopPropagation();
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsDragOverComposer(false);
  };

  // A cancelled drag (Escape) can end without a dragleave on the hovered
  // target, which would leave the drop highlight stuck. dragend always fires
  // on the in-page drag source and bubbles to window, so it is the reset of
  // last resort while the highlight is up.
  useEffect(() => {
    if (!isDragOverComposer) return;
    const onWindowDragEnd = () => {
      setIsDragOverComposer(false);
    };
    window.addEventListener("dragend", onWindowDragEnd);
    return () => window.removeEventListener("dragend", onWindowDragEnd);
  }, [isDragOverComposer]);
  const handleInterruptPrimaryAction = useCallback(() => {
    void onInterrupt();
  }, [onInterrupt]);
  const handleImplementPlanInNewThreadPrimaryAction = useCallback(() => {
    void onImplementPlanInNewThread();
  }, [onImplementPlanInNewThread]);
  // ------------------------------------------------------------------
  // Imperative handle
  // ------------------------------------------------------------------
  const openModelPicker = useCallback(() => {
    setIsComposerModelPickerOpen(true);
  }, []);

  /**
   * Open a composer control by its shortcut. A control on the metadata line
   * wins; one at its default is an invisible anchor on that line that still
   * opens its popup there.
   */
  const openComposerControl = useCallback((command: KeybindingCommand) => {
    const shell = composerFormRef.current?.closest('[data-slot="composer-shell"]');
    const candidates = Array.from(
      shell?.querySelectorAll<HTMLButtonElement>(
        `button[data-composer-shortcut~="${command}"]:not(:disabled)`,
      ) ?? [],
    ).filter((element) => !element.closest("[inert]"));
    const trigger =
      candidates.find((element) => element.checkVisibility({ visibilityProperty: true })) ??
      candidates.find((element) => element.closest("[data-composer-control-anchor]") !== null);
    if (!trigger) return;
    trigger.focus({ preventScroll: true });
    trigger.click();
  }, []);

  const getComposerMenuLaunchers = (): ReadonlyArray<ComposerMenuLauncher> => {
    const launchers: ComposerMenuLauncher[] = [];
    if (!showsModelSegment) {
      launchers.push({
        id: "model",
        label: "Model…",
        shortcutLabel: shortcutLabelForCommand(keybindings, "modelPicker.toggle"),
        onSelect: openModelPicker,
      });
    }
    const shell = composerFormRef.current?.closest('[data-slot="composer-shell"]');
    const seen = new Set<Element>();
    for (const [command, label] of COMPOSER_ANCHORED_CONTROL_LAUNCHERS) {
      const trigger = shell?.querySelector(
        `[data-composer-control-anchor] button[data-composer-shortcut~="${command}"]:not(:disabled)`,
      );
      if (!trigger || seen.has(trigger)) continue;
      seen.add(trigger);
      launchers.push({
        id: command,
        label,
        shortcutLabel: shortcutLabelForCommand(keybindings, command),
        onSelect: () => openComposerControl(command),
      });
    }
    return launchers;
  };

  useImperativeHandle(
    composerRef,
    () => ({
      focusAtEnd: () => {
        composerEditorRef.current?.focusAtEnd();
      },
      focusAt: (cursor: number) => {
        composerEditorRef.current?.focusAt(cursor);
      },
      addDroppedFiles: (files: File[]) => {
        void addComposerAttachments(files).then((inserted) => {
          if (!inserted) focusComposer();
        });
      },
      addDroppedFolders: (folders: File[]) => {
        const target = folderDropTarget({
          localEnvironmentDisabled: isLocalEnvironmentDisabled(),
          environmentId,
          primaryEnvironmentId,
        });
        if (target === "remote") {
          toastManager.add({
            type: "error",
            title: "Folders can't be dropped into remote environments",
          });
          return;
        }
        for (const folder of folders) {
          const path = resolveDroppedFolderPath(folder, window.desktopBridge?.getPathForFile);
          if (path === null) {
            toastManager.add({
              type: "error",
              title: `Couldn't get the path of "${folder.name}"`,
              description: "Type the folder path with @ instead.",
            });
            continue;
          }
          insertComposerTextAtEnd(`${serializeComposerFileLink(path)} `, {
            ensureLeadingBoundary: true,
          });
        }
        focusComposer();
      },
      hasPendingAttachments: () =>
        (pendingImageCompressionsRef.current.get(attachmentTargetKey) ?? 0) > 0,
      insertTextAtEnd: insertComposerTextAtEnd,
      pasteTextAtEnd: (text: string, options) => {
        const bypassAutoAttachment =
          options?.bypassAutoAttachment === true ||
          Date.now() <= pasteAsTextShortcutUntilRef.current;
        pasteAsTextShortcutUntilRef.current = 0;
        const promptLength = promptRef.current.length;
        if (
          !foldPastedText(text, bypassAutoAttachment, {
            start: promptLength,
            end: promptLength,
          })
        ) {
          return false;
        }
        focusComposer();
        return true;
      },
      citeAssistantText: (citation, sourceAnchor) =>
        insertComposerText(
          formatAssistantCitationForComposer(citation, citation.comment),
          "cursor",
          { ensureLeadingBoundary: true, citationCommentAnchor: sourceAnchor },
        ),
      openModelPicker,
      toggleModelPicker: () => {
        if (isComposerModelPickerOpen) {
          setIsComposerModelPickerOpen(false);
        } else {
          openModelPicker();
        }
      },
      openControl: openComposerControl,
      compactContext: compactThreadContext,
      isModelPickerOpen: () => isComposerModelPickerOpen,
      readSnapshot: () => {
        return readComposerSnapshot();
      },
      resetCursorState: (options?: {
        cursor?: number;
        prompt?: string;
        detectTrigger?: boolean;
      }) => {
        const promptForState = options?.prompt ?? promptRef.current;
        const cursor = clampCollapsedComposerCursor(promptForState, options?.cursor ?? 0);
        setComposerHighlightedItemId(null);
        setComposerCursor(cursor);
        resetComposerTrigger(
          options?.detectTrigger
            ? detectComposerTrigger(
                promptForState,
                expandCollapsedComposerCursor(promptForState, cursor),
              )
            : null,
        );
      },
      addTerminalContext: (selection: TerminalContextSelection) => {
        if (!activeThread || isChoiceOnlyPendingQuestion) return;
        const snapshot = readComposerSnapshot();
        const context = {
          id: randomUUID(),
          threadId: activeThread.id,
          createdAt: new Date().toISOString(),
          ...selection,
        };
        const insertion = insertInlineContextReference(
          snapshot.value,
          snapshot.expandedCursor,
          terminalContextReference(context),
        );
        const nextCollapsedCursor = collapseExpandedComposerCursor(
          insertion.prompt,
          insertion.cursor,
        );
        const inserted = insertComposerDraftTerminalContext(
          composerDraftTarget,
          insertion.prompt,
          context,
          composerTerminalContexts.length,
        );
        if (!inserted) return;
        promptRef.current = insertion.prompt;
        setComposerCursor(nextCollapsedCursor);
        setComposerTrigger(detectComposerTrigger(insertion.prompt, insertion.cursor));
        window.requestAnimationFrame(() => {
          composerEditorRef.current?.focusAt(nextCollapsedCursor);
        });
      },
      getSendContext: () => ({
        prompt: promptRef.current,
        images: composerImagesRef.current,
        files: composerFilesRef.current,
        terminalContexts: composerTerminalContextsRef.current,
        previewAnnotations: composerPreviewAnnotations,
        reviewComments: composerReviewComments,
        selectedPromptEffort,
        selectedModelOptionsForDispatch,
        selectedModelSelection,
        multipleModelSelections:
          routeKind === "draft" && multipleModelSelections !== null
            ? multipleModelSelections.map((selection) =>
                selection.instanceId === selectedModelSelection.instanceId &&
                selection.model === selectedModelSelection.model
                  ? selectedModelSelection
                  : selection,
              )
            : null,
        providerAvailable:
          multipleModelSelections !== null ||
          (!noProviderAvailable && providerSendBlockReason === null),
        selectedProvider,
        selectedModel,
        selectedProviderModels,
        interactionMode,
        interactionModeEnabled: planModeUiEnabled,
      }),
      setMultipleModelSelections,
      validateProviderInput: (providerInput: string) => {
        const validationMessage = getComposerSubmissionValidationMessage({
          prompt: promptRef.current,
          providerInput,
          submissionTarget: "provider-turn",
        });
        providerInputRejectedRef.current = validationMessage !== null;
        setProviderInputSubmissionError(validationMessage);
        return validationMessage === null;
      },
    }),
    [
      activeThread,
      addComposerAttachments,
      foldPastedText,
      composerDraftTarget,
      composerCursor,
      composerTerminalContexts,
      insertComposerDraftTerminalContext,
      insertComposerText,
      insertComposerTextAtEnd,
      promptRef,
      composerImagesRef,
      composerFilesRef,
      composerTerminalContextsRef,
      composerPreviewAnnotations,
      composerReviewComments,
      focusComposer,
      environmentId,
      primaryEnvironmentId,
      isConnecting,
      isComposerApprovalState,
      isChoiceOnlyPendingQuestion,
      pendingUserInputs.length,
      projectSelectionRequired,
      applyPromptReplacement,
      isComposerModelPickerOpen,
      openModelPicker,
      readComposerSnapshot,
      resetComposerTrigger,
      setComposerTrigger,
      selectedModel,
      selectedModelOptionsForDispatch,
      selectedModelSelection,
      multipleModelSelections,
      setMultipleModelSelections,
      routeKind,
      noProviderAvailable,
      providerSendBlockReason,
      selectedPromptEffort,
      selectedProvider,
      selectedProviderModels,
      interactionMode,
      planModeUiEnabled,
      compactThreadContext,
      openComposerControl,
    ],
  );

  // Render
  // ------------------------------------------------------------------
  return (
    <form
      ref={composerFormRef}
      onSubmit={submitComposer}
      onDragEnterCapture={composerMentionDragHandlers.onDragEnter}
      onDragOverCapture={composerMentionDragHandlers.onDragOver}
      onDragLeaveCapture={onComposerMentionDragLeaveCapture}
      onDropCapture={composerMentionDragHandlers.onDrop}
      className="group/composer mx-auto w-full min-w-0 max-w-(--chat-max-width)"
      data-chat-composer-form="true"
    >
      {/* Notices above the prompt: flat hairline rows in the gutter grammar. */}
      <ComposerBannerStack key={activeThreadId} className="relative z-0" items={bannerStackItems} />
      {!activityStackItem && (shownSyncPhase || inlineTasksBadge) ? (
        <ComposerBanner.Root data-chat-composer-activity-strip="true">
          {shownSyncPhase ? <ComposerActivityRow phase={shownSyncPhase} /> : inlineTasksBadge}
        </ComposerBanner.Root>
      ) : null}
      {showPlanFollowUpPrompt && activeProposedPlan && pendingUserInputs.length === 0 ? (
        <ComposerBanner.Root data-chat-composer-plan-follow-up="true">
          <ComposerPlanFollowUpBanner
            key={activeProposedPlan.id}
            planTitle={proposedPlanTitle(activeProposedPlan.planMarkdown) ?? null}
          />
        </ComposerBanner.Root>
      ) : null}
      {!activityStackItem &&
      isTasksDrawerOpen &&
      !hasBlockingComposerTopDrawer &&
      activeTasksProgress &&
      activeTaskSteps ? (
        <ComposerTasksDrawer
          onCollapse={toggleTasksDrawer}
          progress={activeTasksProgress}
          steps={activeTaskSteps}
        />
      ) : null}
      {showTasksTab ? (
        <ComposerBanner.Root>
          <ComposerTasksBadge
            expanded={false}
            onToggle={toggleTasksDrawer}
            placement="inline"
            progress={activeTasksProgress}
            steps={activeTaskSteps}
          />
        </ComposerBanner.Root>
      ) : null}
      {/* Needs you: the pending approval or question, directly above a prompt
          that stays one usable line for answering or redirecting. */}
      {activePendingApproval || pendingUserInputs.length > 0 ? (
        <div data-chat-needs-you-dock="true">
          {activePendingApproval ? (
            <>
              <ComposerPendingApprovalPanel
                approval={activePendingApproval}
                pendingCount={pendingApprovals.length}
              />
              <ComposerPendingApprovalActions
                requestId={activePendingApproval.requestId}
                isResponding={respondingRequestIds.includes(activePendingApproval.requestId)}
                options={activePendingApproval.options}
                onRespondToApproval={onRespondToApproval}
              />
            </>
          ) : (
            <ComposerPendingUserInputPanel
              pendingUserInputs={pendingUserInputs}
              respondingRequestIds={
                activePendingIsResponding && activePendingUserInput
                  ? [...respondingRequestIds, activePendingUserInput.requestId]
                  : respondingRequestIds
              }
              answers={activePendingDraftAnswers}
              questionIndex={activePendingQuestionIndex}
              onToggleOption={onSelectActivePendingUserInputOption}
              onAdvance={onAdvanceActivePendingUserInput}
              onDismiss={onDismissActivePendingUserInput}
            />
          )}
        </div>
      ) : null}
      <ComposerSurface.Main>
        {/* The prompt line's rule: 1px at rest, 2px primary while the composer
            holds focus. Drawn over the line's top padding so it never shifts it. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-px bg-border group-focus-within/composer:h-0.5 group-focus-within/composer:bg-primary",
            composerProviderState.composerFrameClassName,
          )}
        />
        <div
          ref={composerSurfaceRef}
          data-chat-composer-surface="true"
          className={cn(
            "relative pt-1.5 pb-1",
            isDragOverComposer ? "bg-accent/45" : null,
            projectSelectionRequired ? "opacity-75" : null,
          )}
        >
          <div ref={setComposerMenuAnchor} data-chat-composer-body="true" className="relative">
            {isStashMenuOpen && !composerMenuOpen && !isComposerApprovalState && (
              <ComposerCommandMenuLayer anchor={composerMenuAnchor}>
                <ComposerStashMenu
                  entries={stashQueue}
                  stashShortcutLabel={shortcutLabelForCommand(keybindings, "composer.stash", {
                    context: {
                      terminalFocus: false,
                      terminalOpen,
                      modelPickerOpen: false,
                    },
                  })}
                  onRestore={restoreStashEntry}
                  onDelete={deleteStashEntry}
                  onClose={() => setIsStashMenuOpen(false)}
                />
              </ComposerCommandMenuLayer>
            )}

            {composerMenuOpen && (
              <ComposerCommandMenuLayer anchor={composerMenuAnchor}>
                <ComposerCommandMenu
                  items={composerMenuItems}
                  resolvedTheme={resolvedTheme}
                  isLoading={isComposerMenuLoading}
                  triggerKind={composerTriggerKind}
                  emptyStateText={composerMenuEmptyState}
                  activeItemId={activeComposerMenuItem?.id ?? null}
                  onHighlightedItemChange={onComposerMenuItemHighlighted}
                  onSelect={onSelectComposerItem}
                />
              </ComposerCommandMenuLayer>
            )}

            {(uncommittedSnapShotIds.length > 0 ||
              composerVideos.length > 0 ||
              standaloneComposerImages.length > 0) && (
              <div
                className={cn(
                  "mb-1 flex max-w-full items-end gap-1.5 ps-(--chat-content-inset)",
                  pendingSnapShotIds.length > 0 ||
                    standaloneComposerImages.some((image) => image.source?.kind === "snap-shot")
                    ? "snap-x snap-proximity overflow-x-auto overscroll-x-contain pb-1 scrollbar-thumb-foreground/18 scrollbar-track-transparent [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-3 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-foreground/18 [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb:hover]:bg-foreground/28 [&::-webkit-scrollbar-track]:mx-1 [&::-webkit-scrollbar-track]:bg-transparent"
                    : "flex-wrap",
                )}
              >
                {standaloneComposerImages
                  .map((image) => {
                    const upload = supportsAttachmentUploads
                      ? uploadsByImageId[image.id]
                      : undefined;
                    if (image.source?.kind !== "snap-shot") {
                      return (
                        <ComposerAttachmentChip
                          key={image.id}
                          icon={
                            image.previewUrl ? (
                              <ComposerImageThumbnail
                                file={image.file}
                                alt=""
                                className="size-full object-cover"
                                fallback={<FileIcon className="size-3" />}
                              />
                            ) : (
                              <FileIcon className="size-3" />
                            )
                          }
                          name={image.name}
                          detail={
                            upload?.status === "uploading"
                              ? formatAttachmentUploadProgress(upload.progress)
                              : null
                          }
                          openLabel={`Preview ${image.name}`}
                          onOpen={
                            image.previewUrl
                              ? () => {
                                  const preview = buildExpandedImagePreview(
                                    composerImages,
                                    image.id,
                                  );
                                  if (preview) onExpandImage(preview);
                                }
                              : null
                          }
                          notPersisted={nonPersistedComposerImageIdSet.has(image.id)}
                          retry={
                            upload?.status === "failed"
                              ? {
                                  reason: upload.reason,
                                  onRetry: () =>
                                    retryAttachmentUpload({
                                      environmentId,
                                      image,
                                      draftTarget: attachmentDraftTarget,
                                    }),
                                }
                              : null
                          }
                          onRemove={() => removeComposerImage(image.id)}
                        />
                      );
                    }
                    const snapShotAnimationPending =
                      image.source?.kind === "snap-shot" && pendingSnapShotIdSet.has(image.id);
                    const snapShotArrival =
                      image.source?.kind === "snap-shot" &&
                      shouldAnimateSnapShotArrival(image.source.capturedAt);
                    return (
                      <SnapShotAttachmentFrame
                        key={image.id}
                        data-chat-composer-expanded-image="true"
                        aria-hidden={snapShotAnimationPending || undefined}
                        inert={snapShotAnimationPending || undefined}
                        arrival={snapShotArrival}
                        animateArrival={
                          settings.snapShotAnimations &&
                          !snapShotAnimationPending &&
                          snapShotArrival
                        }
                        animationId={snapShotAnimationPending ? image.id : undefined}
                        animationSource={snapShotAnimationPending ? image.source : undefined}
                        className={cn(
                          "group/attachment shrink-0 snap-start bg-background",
                          SNAP_SHOT_ATTACHMENT_FRAME_CLASS,
                          snapShotAnimationPending && "invisible",
                        )}
                      >
                        {image.previewUrl ? (
                          <button
                            type="button"
                            className="h-full w-full cursor-zoom-in"
                            aria-label={`Preview ${image.name}`}
                            onClick={() => {
                              const preview = buildExpandedImagePreview(composerImages, image.id);
                              if (!preview) return;
                              onExpandImage(preview);
                            }}
                          >
                            <ComposerImageThumbnail
                              file={image.file}
                              alt={image.name}
                              className="h-full w-full object-cover"
                              fallback={
                                <span className="flex h-full items-center justify-center px-1 text-3xs text-secondary-label">
                                  {image.name}
                                </span>
                              }
                            />
                          </button>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center px-1 text-center text-3xs text-secondary-label">
                            {image.name}
                          </div>
                        )}
                        {image.source?.kind === "snap-shot" ? (
                          <SnapShotAttachmentDetails
                            source={image.source}
                            className={cn(
                              upload?.status === "uploading" && "bottom-4",
                              upload?.status === "failed" && "bottom-8",
                            )}
                          />
                        ) : null}
                        {nonPersistedComposerImageIdSet.has(image.id) && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span
                                  role="img"
                                  aria-label="Draft attachment may not persist"
                                  className="absolute left-1 top-1 inline-flex items-center justify-center rounded bg-background/85 p-0.5 text-warning-foreground"
                                >
                                  <CircleAlertIcon className="size-3" />
                                </span>
                              }
                            />
                            <TooltipPopup side="top">
                              Draft attachment could not be saved locally and may be lost on
                              navigation.
                            </TooltipPopup>
                          </Tooltip>
                        )}
                        {upload?.status === "uploading" && (
                          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/85 px-1 text-center text-3xs text-foreground">
                            {formatAttachmentUploadProgress(upload.progress)}
                          </span>
                        )}
                        {upload?.status === "failed" && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="overlay"
                                  size="icon-xs"
                                  className="absolute bottom-1 left-1"
                                  onClick={() =>
                                    retryAttachmentUpload({
                                      environmentId,
                                      image,
                                      draftTarget: attachmentDraftTarget,
                                    })
                                  }
                                  aria-label={`Retry upload for ${image.name}`}
                                />
                              }
                            >
                              <RefreshIcon />
                            </TooltipTrigger>
                            <TooltipPopup side="top">{upload.reason}</TooltipPopup>
                          </Tooltip>
                        )}
                        {/* Snap-shot frames reveal their remove button on hover or focus. */}
                        <span
                          className={cn(
                            "absolute right-1 top-1 flex",
                            image.source?.kind === "snap-shot" &&
                              "opacity-0 transition-opacity pointer-coarse:opacity-100 group-hover/attachment:opacity-100 group-focus-within/attachment:opacity-100",
                          )}
                        >
                          <Button
                            variant="media-close"
                            size="icon-xs"
                            onClick={() => removeComposerImage(image.id)}
                            aria-label={`Remove ${image.name}`}
                          >
                            <XIcon />
                          </Button>
                        </span>
                      </SnapShotAttachmentFrame>
                    );
                  })
                  .concat(
                    uncommittedSnapShotIds.map((captureId) => (
                      <SnapShotAttachmentFrame
                        key={captureId}
                        aria-hidden="true"
                        animationId={captureId}
                        animationSource={
                          pendingSnapShotAnimations.find((capture) => capture.id === captureId)
                            ?.source
                        }
                        className={cn(
                          SNAP_SHOT_ATTACHMENT_FRAME_CLASS,
                          "invisible shrink-0 snap-start bg-background",
                        )}
                      />
                    )),
                  )}
                {composerVideos.map((file) => {
                  const fileCanUpload =
                    supportsAttachmentUploads &&
                    maxFileAttachmentBytes !== null &&
                    file.sizeBytes <= maxFileAttachmentBytes;
                  const upload = fileCanUpload ? uploadsByImageId[file.id] : undefined;
                  return (
                    <ComposerAttachmentChip
                      key={file.id}
                      icon={<PlayIcon className="size-3 fill-current" />}
                      name={file.name}
                      detail={
                        upload?.status === "uploading"
                          ? formatAttachmentUploadProgress(upload.progress)
                          : formatAttachmentSize(file.sizeBytes)
                      }
                      openLabel={`Play ${file.name}`}
                      onOpen={() => {
                        if (file.file !== null) {
                          const preview = buildExpandedImagePreview([file], file.id);
                          if (preview) onExpandImage(preview);
                          return;
                        }
                        if (!file.uploadedAttachmentId) return;
                        onFileOpen({ ...file, id: file.uploadedAttachmentId });
                      }}
                      retry={
                        upload?.status === "failed"
                          ? {
                              reason: upload.reason,
                              onRetry: () =>
                                retryAttachmentUpload({
                                  environmentId,
                                  image: file,
                                  draftTarget: attachmentDraftTarget,
                                }),
                            }
                          : null
                      }
                      onRemove={() => removeComposerFileFromDraft(file.id)}
                    />
                  );
                })}
              </div>
            )}

            {composerOtherFiles.length > 0 && (
              <div className="mb-1 flex flex-wrap gap-1.5 ps-(--chat-content-inset)">
                {composerOtherFiles.map((file) => {
                  const fileCanUpload =
                    supportsAttachmentUploads &&
                    maxFileAttachmentBytes !== null &&
                    file.sizeBytes <= maxFileAttachmentBytes;
                  const upload = fileCanUpload ? uploadsByImageId[file.id] : undefined;
                  const needsReattach = composerFileNeedsReattach(file);
                  const canReattachFile =
                    fileStagingLimit !== null && file.sizeBytes <= fileStagingLimit;
                  return (
                    <ComposerAttachmentChip
                      key={file.id}
                      icon={
                        <PierreEntryIcon
                          pathValue={file.name}
                          kind="file"
                          theme={resolvedTheme}
                          className="size-3"
                        />
                      }
                      name={file.name}
                      detail={
                        needsReattach
                          ? canReattachFile
                            ? "Attach again"
                            : "Remove to send"
                          : upload?.status === "uploading"
                            ? formatAttachmentUploadProgress(upload.progress)
                            : formatAttachmentSize(file.sizeBytes)
                      }
                      openLabel={`Preview ${file.name}`}
                      onOpen={needsReattach ? null : () => setPreviewFileId(file.id)}
                      retry={
                        !needsReattach && upload?.status === "failed"
                          ? {
                              reason: upload.reason,
                              onRetry: () =>
                                retryAttachmentUpload({
                                  environmentId,
                                  image: file,
                                  draftTarget: attachmentDraftTarget,
                                }),
                            }
                          : null
                      }
                      onRemove={() => removeComposerFileFromDraft(file.id)}
                    />
                  );
                })}
              </div>
            )}

            <ChatGutterRow
              glyph="you"
              size="prose"
              glyphClassName="group-focus-within/composer:text-primary"
            >
              <div className="flex min-w-0 items-end gap-1.5">
                <div className="min-w-0 flex-1">
                  {previewFile ? (
                    <Dialog
                      open
                      onOpenChange={(open) => {
                        if (!open) setPreviewFileId(null);
                      }}
                    >
                      <DialogPopup
                        {...composerFloatingLayerProps}
                        className="h-[min(85vh,52rem)] max-w-4xl overflow-hidden"
                        showCloseButton={false}
                      >
                        <DialogTitle className="sr-only">{previewFile.name}</DialogTitle>
                        <AttachmentFilePreview
                          key={previewFile.id}
                          name={previewFile.name}
                          mimeType={previewFile.mimeType}
                          sizeBytes={previewFile.sizeBytes}
                          file={previewFile.file}
                          origin="Draft"
                          {...(previewFile.uploadedAttachmentId && previewFile.uploadEnvironmentId
                            ? {
                                asset: {
                                  environmentId: previewFile.uploadEnvironmentId,
                                  attachmentId: previewFile.uploadedAttachmentId,
                                },
                              }
                            : {})}
                          onRemove={() => {
                            removeComposerFileFromDraft(previewFile.id);
                            setPreviewFileId(null);
                          }}
                          onClose={() => setPreviewFileId(null)}
                        />
                      </DialogPopup>
                    </Dialog>
                  ) : null}
                  <ComposerContextActionsContext value={composerContextActions}>
                    <ComposerPromptEditor
                      editorRef={composerEditorRef}
                      richTextEnabled={settings.composerRichTextEnabled}
                      value={activePendingProgress ? activePendingProgress.customAnswer : prompt}
                      cursor={composerCursor}
                      contextRecords={composerContextRecords}
                      buildContextClipboardFragment={buildContextClipboardFragment}
                      importContextFragment={importContextFragment}
                      skills={selectedProviderSkills}
                      onChange={onPromptChange}
                      onCommandKeyDown={onComposerCommandKey}
                      onPageScrollKeyDown={onPageScrollKeyDown}
                      onPageScrollKeyUp={onPageScrollKeyUp}
                      onPageScrollRelease={onPageScrollRelease}
                      onCitationSubmitAndSend={submitCitationAndSend}
                      onPaste={onComposerPaste}
                      placeholder={
                        isComposerApprovalState
                          ? "Or tell the agent what to do instead…"
                          : activePendingProgress
                            ? isChoiceOnlyPendingQuestion
                              ? "Choose an option above"
                              : "Type your own answer, or leave blank for the selected option"
                            : showPlanFollowUpPrompt && activeProposedPlan
                              ? "Refine the plan, or leave blank to implement it"
                              : projectSelectionRequired
                                ? "Choose a project above to start a thread"
                                : showProviderUnavailable
                                  ? "Enable a provider in Settings to send a message"
                                  : phase === "disconnected"
                                    ? DISCONNECTED_COMPOSER_PLACEHOLDER
                                    : phase === "running"
                                      ? "Queue a follow-up…"
                                      : "Ask anything…"
                      }
                      disabled={
                        isConnecting ||
                        projectSelectionRequired ||
                        isChoiceOnlyPendingQuestion ||
                        activePendingIsResponding
                      }
                    />
                  </ComposerContextActionsContext>
                </div>
                <div
                  data-chat-composer-actions="right"
                  className="flex h-(--chat-text-leading) shrink-0 items-center gap-1.5"
                >
                  {showComposerAttachAction ? (
                    <>
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.currentTarget.files ?? []);
                          event.currentTarget.value = "";
                          // Inserting a chip refocuses the editor after the draft renders;
                          // focusing synchronously here would report the editor's stale text
                          // over the prompt that was just written.
                          void addComposerAttachments(files).then((inserted) => {
                            if (!inserted) focusComposer();
                          });
                        }}
                      />
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              className="relative hidden size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none after:absolute after:-inset-0.5 group-focus-within/composer:flex hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                              onPointerDown={(event) => event.preventDefault()}
                              onClick={() => attachmentInputRef.current?.click()}
                              aria-label="Attach files"
                            />
                          }
                        >
                          <PlusIcon className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipPopup>Attach files</TooltipPopup>
                      </Tooltip>
                    </>
                  ) : null}
                  {showsPrimaryActions ? (
                    <ComposerPrimaryActions
                      pendingAction={pendingPrimaryAction}
                      isRunning={phase === "running"}
                      showPlanFollowUpPrompt={
                        pendingUserInputs.length === 0 && showPlanFollowUpPrompt
                      }
                      promptHasText={prompt.trim().length > 0}
                      isSendBusy={isSendBusy}
                      sendDisabledReason={sendDisabledReason}
                      isConnecting={isConnecting}
                      isEnvironmentUnavailable={
                        environmentUnavailable !== null ||
                        noProviderAvailable ||
                        projectSelectionRequired
                      }
                      isPreparingWorktree={isPreparingWorktree}
                      hasSendableContent={composerSendState.hasSendableContent}
                      preserveComposerFocusOnPointerDown={isMobileViewport}
                      onPreviousPendingQuestion={onPreviousActivePendingUserInputQuestion}
                      onInterrupt={handleInterruptPrimaryAction}
                      onImplementPlanInNewThread={handleImplementPlanInNewThreadPrimaryAction}
                    />
                  ) : null}
                </div>
              </div>
            </ChatGutterRow>
          </div>

          <ComposerPromptLengthValidation
            message={providerInputSubmissionError ?? composerSubmissionError}
          />

          {/* The metadata line: the project, then only what differs from the
                user's defaults, then ⋯. Controls at their default stay mounted
                as invisible anchors so shortcuts and ⋯ still open them. The
                branch toolbar portals its workspace segments in here too. */}
          <div
            ref={metadataSlot?.attach}
            data-chat-composer-metadata="true"
            className="relative mt-0.5 flex h-(--chat-meta-leading) min-w-0 items-center gap-1.5 ps-(--chat-content-inset) text-chat-meta text-muted-foreground"
          >
            <ComposerSurface.Segment segment="project">
              <span className="min-w-0 truncate">{composerProject?.title ?? "No project"}</span>
            </ComposerSurface.Segment>
            <ComposerSurface.Segment segment="model" hidden={!showsModelSegment}>
              {modelSegment}
            </ComposerSurface.Segment>
            {metadataSegments.has("plan") ? (
              <ComposerSurface.Segment segment="plan">
                <ComposerPlanToggle onToggle={toggleInteractionMode} />
              </ComposerSurface.Segment>
            ) : null}
            <ComposerSurface.Segment segment="access" hidden={!metadataSegments.has("access")}>
              <ComposerAccessControl
                runtimeMode={runtimeMode}
                onRuntimeModeChange={handleRuntimeModeChange}
              />
            </ComposerSurface.Segment>
            {providerTraitsSegment ? (
              <ComposerSurface.Segment segment="effort" hidden={!showsEffortSegment}>
                {providerTraitsSegment}
              </ComposerSurface.Segment>
            ) : null}
            {metadataSegments.has("stash") ? (
              <ComposerSurface.Segment segment="stash">
                <ComposerStashBadge
                  count={stashQueue.length}
                  menuOpen={isStashMenuOpen}
                  pulseKey={stashPulse.key}
                  pulsing={stashPulse.active}
                  onToggleMenu={toggleStashMenu}
                />
              </ComposerSurface.Segment>
            ) : null}
            <ComposerSurface.Segment segment="more">
              <CompactComposerControlsMenu
                interactionMode={interactionMode}
                runtimeMode={runtimeMode}
                showInteractionModeToggle={planModeUiEnabled}
                traitsMenuContent={showsEffortSegment ? undefined : providerTraitsMenuContent}
                getLaunchers={getComposerMenuLaunchers}
                onToggleInteractionMode={toggleInteractionMode}
                onRuntimeModeChange={handleRuntimeModeChange}
              />
            </ComposerSurface.Segment>
            <span
              aria-hidden
              className="order-last ms-auto hidden shrink-0 ps-2 whitespace-nowrap group-focus-within/composer:inline @max-[30rem]/chat:hidden!"
            >
              {prompt.trim().length > 0
                ? phase === "running"
                  ? "↵ queue · ⇧↵ newline"
                  : "↵ send · ⇧↵ newline"
                : "/ commands · @ files · $ skills"}
            </span>
          </div>
        </div>
      </ComposerSurface.Main>
    </form>
  );
});
