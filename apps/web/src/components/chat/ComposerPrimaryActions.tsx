import { memo, type PointerEventHandler } from "react";
import { ChevronDownIcon, ChevronLeftIcon } from "lucide-react";
import { useEnvironmentIdentificationMode } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { StageBackdropButtonArt, useSidebarStageBackdropVariant } from "../SidebarStageBackdrop";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Spinner } from "../ui/spinner";
import { composerFloatingLayerProps } from "./composerEventScope";

interface PendingActionState {
  questionIndex: number;
  isLastQuestion: boolean;
  canAdvance: boolean;
  isResponding: boolean;
  isComplete: boolean;
}

interface ComposerPrimaryActionsProps {
  pendingAction: PendingActionState | null;
  isRunning: boolean;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  sendDisabledReason: string | null;
  isConnecting: boolean;
  isEnvironmentUnavailable: boolean;
  isPreparingWorktree: boolean;
  hasSendableContent: boolean;
  preserveComposerFocusOnPointerDown?: boolean;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
}

const formatPendingPrimaryActionLabel = (input: {
  isLastQuestion: boolean;
  isResponding: boolean;
}) => {
  if (input.isResponding) {
    return "Submitting...";
  }
  return input.isLastQuestion ? "Submit" : "Next";
};

// The prompt line's actions sit inline at its right edge: 20px marks with a 24px hit area
// (the pseudo-element), so they never make the line taller. Labeled actions (Submit, Refine,
// Implement) share the send button's message-action color as 20px pills; they are
// composer-owned buttons rather than restyled Buttons.
const hitAreaClassName = "relative after:absolute after:-inset-0.5";
const glyphButtonClassName = cn(
  hitAreaClassName,
  "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
);
const messageActionPillClassName = cn(
  hitAreaClassName,
  "inline-flex h-5 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-full bg-message-action px-2 font-medium text-chat-meta text-message-action-foreground outline-none hover:bg-message-action-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64",
);

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
  event.preventDefault();
};

export const ComposerPrimaryActions = memo(function ComposerPrimaryActions({
  pendingAction,
  isRunning,
  showPlanFollowUpPrompt,
  promptHasText,
  isSendBusy,
  sendDisabledReason,
  isConnecting,
  isEnvironmentUnavailable,
  isPreparingWorktree,
  hasSendableContent,
  preserveComposerFocusOnPointerDown = false,
  onPreviousPendingQuestion,
  onInterrupt,
  onImplementPlanInNewThread,
}: ComposerPrimaryActionsProps) {
  const pointerFocusProps = preserveComposerFocusOnPointerDown
    ? { onPointerDown: preventPointerFocus }
    : undefined;
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const isSendDisabled = sendDisabledReason !== null;
  const stageBackdropVariant = useSidebarStageBackdropVariant(
    environmentIdentificationMode === "artwork",
  );

  const renderStopGenerationButton = () => (
    <button
      type="button"
      className={cn(glyphButtonClassName, "bg-destructive/90 text-white hover:bg-destructive")}
      {...pointerFocusProps}
      onClick={onInterrupt}
      aria-label="Stop generation"
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
        <rect x="0.5" y="0.5" width="7" height="7" rx="1.25" />
      </svg>
    </button>
  );

  if (pendingAction) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        {isRunning ? renderStopGenerationButton() : null}
        {pendingAction.questionIndex > 0 ? (
          <button
            type="button"
            className={cn(
              glyphButtonClassName,
              "text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-64",
            )}
            {...pointerFocusProps}
            onClick={onPreviousPendingQuestion}
            disabled={pendingAction.isResponding}
            aria-label="Previous question"
          >
            <ChevronLeftIcon className="size-3.5" />
          </button>
        ) : null}
        <button
          type="submit"
          className={messageActionPillClassName}
          {...pointerFocusProps}
          disabled={
            isEnvironmentUnavailable ||
            pendingAction.isResponding ||
            (pendingAction.isLastQuestion ? !pendingAction.isComplete : !pendingAction.canAdvance)
          }
        >
          {formatPendingPrimaryActionLabel({
            isLastQuestion: pendingAction.isLastQuestion,
            isResponding: pendingAction.isResponding,
          })}
        </button>
      </div>
    );
  }

  if (showPlanFollowUpPrompt) {
    if (promptHasText) {
      return (
        <button
          type="submit"
          className={messageActionPillClassName}
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Refine"}
        </button>
      );
    }

    return (
      <div data-chat-composer-implement-actions="true" className="flex items-center justify-end">
        <button
          type="submit"
          className={cn(messageActionPillClassName, "rounded-r-none")}
          {...pointerFocusProps}
          disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Implement"}
        </button>
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  messageActionPillClassName,
                  "rounded-l-none border-l border-message-action-foreground/20 px-1",
                )}
                aria-label="Implementation actions"
                {...pointerFocusProps}
                disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="top" {...composerFloatingLayerProps}>
            <MenuItem
              disabled={isSendBusy || isSendDisabled || isConnecting || isEnvironmentUnavailable}
              onClick={() => void onImplementPlanInNewThread()}
            >
              Implement in a new thread
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    );
  }

  const sendButton = (
    <button
      type="submit"
      className={cn(
        glyphButtonClassName,
        "isolate disabled:pointer-events-none disabled:opacity-64",
        stageBackdropVariant
          ? "bg-transparent text-white enabled:hover:brightness-110"
          : "bg-message-action text-message-action-foreground hover:bg-message-action-hover",
      )}
      {...pointerFocusProps}
      disabled={
        isSendBusy ||
        isSendDisabled ||
        isConnecting ||
        isEnvironmentUnavailable ||
        !hasSendableContent
      }
      aria-label={
        isEnvironmentUnavailable
          ? "Environment disconnected"
          : sendDisabledReason
            ? sendDisabledReason
            : isConnecting
              ? "Connecting"
              : isPreparingWorktree
                ? "Preparing worktree"
                : isSendBusy
                  ? "Sending"
                  : isRunning
                    ? "Queue message"
                    : "Send message"
      }
    >
      {stageBackdropVariant ? (
        <span className="absolute inset-0 -z-10 overflow-hidden rounded-full" aria-hidden="true">
          <StageBackdropButtonArt variant={stageBackdropVariant} />
        </span>
      ) : null}
      {isConnecting || isSendBusy ? (
        <Spinner size="xs" aria-hidden="true" />
      ) : (
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );

  if (!isRunning) {
    return sendButton;
  }

  // While a turn runs, a sendable draft queues for the next tool boundary, so
  // the send button stays next to Stop on every viewport.
  return (
    <>
      {renderStopGenerationButton()}
      {hasSendableContent ? sendButton : null}
    </>
  );
});
