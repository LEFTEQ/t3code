import { type ApprovalRequestId } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type PendingUserInput } from "../../session-logic";
import {
  derivePendingUserInputProgress,
  type PendingUserInputDraftAnswer,
} from "../../pendingUserInput";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { cn } from "~/lib/utils";
import { ChatGutterRow } from "./ChatGutter";

interface PendingUserInputPanelProps {
  pendingUserInputs: PendingUserInput[];
  respondingRequestIds: ApprovalRequestId[];
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionValue: string) => void;
  onAdvance: () => void;
  onDismiss: (requestId: ApprovalRequestId) => void;
}

export const ComposerPendingUserInputPanel = memo(function ComposerPendingUserInputPanel({
  pendingUserInputs,
  respondingRequestIds,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
  onDismiss,
}: PendingUserInputPanelProps) {
  if (pendingUserInputs.length === 0) return null;
  const activePrompt = pendingUserInputs[0];
  if (!activePrompt) return null;

  return (
    <ComposerPendingUserInputCard
      key={activePrompt.requestId}
      prompt={activePrompt}
      isResponding={respondingRequestIds.includes(activePrompt.requestId)}
      answers={answers}
      questionIndex={questionIndex}
      onToggleOption={onToggleOption}
      onAdvance={onAdvance}
      onDismiss={onDismiss}
    />
  );
});

const ComposerPendingUserInputCard = memo(function ComposerPendingUserInputCard({
  prompt,
  isResponding,
  answers,
  questionIndex,
  onToggleOption,
  onAdvance,
  onDismiss,
}: {
  prompt: PendingUserInput;
  isResponding: boolean;
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionValue: string) => void;
  onAdvance: () => void;
  onDismiss: (requestId: ApprovalRequestId) => void;
}) {
  const progress = derivePendingUserInputProgress(prompt.questions, answers, questionIndex);
  const activeQuestion = progress.activeQuestion;
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const onAdvanceRef = useRef(onAdvance);
  const [optimisticSingleSelect, setOptimisticSingleSelect] = useState<{
    questionId: string;
    optionValue: string;
  } | null>(null);
  // Collapsing hides everything but the header so a tall prompt stops covering
  // the thread the user is trying to read. Scoped to a single question: the card
  // is keyed by request id so the next prompt starts expanded, and storing the
  // collapsed question's id (rather than a bare flag) reopens the card when the
  // prompt advances to its next question, which can happen without a click —
  // sending from the composer advances the active question.
  const [collapsedQuestionId, setCollapsedQuestionId] = useState<string | null>(null);
  const isCollapsed = collapsedQuestionId !== null && collapsedQuestionId === activeQuestion?.id;

  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  useEffect(() => {
    if (!activeQuestion || activeQuestion.multiSelect || !optimisticSingleSelect) {
      return;
    }
    if (optimisticSingleSelect.questionId !== activeQuestion.id) {
      setOptimisticSingleSelect(null);
      return;
    }
    if (
      progress.customAnswer.trim().length === 0 &&
      progress.selectedOptionValues.includes(optimisticSingleSelect.optionValue)
    ) {
      setOptimisticSingleSelect(null);
    }
  }, [
    activeQuestion,
    optimisticSingleSelect,
    progress.customAnswer,
    progress.selectedOptionValues,
  ]);

  // Clear auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, []);

  const handleOptionSelection = useCallback(
    (questionId: string, optionValue: string) => {
      if (activeQuestion?.multiSelect) {
        onToggleOption(questionId, optionValue);
        return;
      }
      setOptimisticSingleSelect({ questionId, optionValue });
      onToggleOption(questionId, optionValue);
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        onAdvanceRef.current();
      }, 200);
    },
    [activeQuestion, onToggleOption],
  );

  // Keyboard shortcut: number keys 1-9 select corresponding options when focus is
  // outside editable fields. Multi-select prompts toggle options in place; single-
  // select prompts keep the existing auto-advance behavior. Collapsed prompts opt
  // out, since the numbers they refer to are not on screen.
  useEffect(() => {
    if (!activeQuestion || isResponding || isCollapsed) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      if (
        target instanceof HTMLElement &&
        target.closest('[contenteditable]:not([contenteditable="false"])')
      ) {
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
      const optionIndex = digit - 1;
      if (optionIndex >= activeQuestion.options.length) return;
      const option = activeQuestion.options[optionIndex];
      if (!option) return;
      event.preventDefault();
      handleOptionSelection(activeQuestion.id, option.value ?? option.label);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeQuestion, handleOptionSelection, isCollapsed, isResponding]);

  if (!activeQuestion) {
    return null;
  }

  const customAnswerActive = progress.customAnswer.trim().length > 0;

  return (
    <Collapsible
      open={!isCollapsed}
      onOpenChange={(open) => {
        setCollapsedQuestionId(open ? null : activeQuestion.id);
      }}
    >
      <div
        className="w-full min-w-0 border-t border-warning/70 bg-linear-to-b from-warning/8 to-transparent pt-(--chat-gap)"
        data-chat-needs-you="question"
      >
        <ChatGutterRow glyph="needs-you" size="prose">
          <CollapsibleTrigger
            render={<button type="button" />}
            className="flex w-full min-w-0 cursor-pointer items-baseline gap-2 rounded-xs text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={
              isCollapsed
                ? "Show the question and its options"
                : "Hide the question and its options"
            }
            data-pending-user-input-toggle={isCollapsed ? "collapsed" : "expanded"}
          >
            <span
              className={cn(
                "min-w-0 flex-1 text-chat font-semibold text-foreground wrap-anywhere",
                isCollapsed && "truncate",
              )}
            >
              {activeQuestion.question}
            </span>
            <span className="flex shrink-0 items-baseline gap-1.5 text-chat-meta text-muted-foreground">
              <span className="max-w-32 truncate">{activeQuestion.header}</span>
              {prompt.questions.length > 1 ? (
                <span className="tabular-nums">
                  · question {questionIndex + 1} of {prompt.questions.length}
                </span>
              ) : null}
              <ChevronDownIcon
                aria-hidden
                className={cn("size-3 self-center", isCollapsed && "-rotate-90")}
              />
              {prompt.dismissible ? (
                // Sits inside the trigger button, so stop the click from toggling
                // the disclosure. Dismiss closes the question without a reply.
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Dismiss question without answering"
                  aria-disabled={isResponding || undefined}
                  data-pending-user-input-dismiss
                  className="relative grid size-4 place-items-center self-center rounded-xs outline-none before:absolute before:-inset-1 before:content-[''] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!isResponding) onDismiss(prompt.requestId);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (!isResponding) onDismiss(prompt.requestId);
                  }}
                >
                  <XIcon className="size-3" />
                </span>
              ) : null}
            </span>
          </CollapsibleTrigger>
        </ChatGutterRow>
        <CollapsiblePanel>
          <div className="max-h-64 overflow-y-auto ps-(--chat-content-inset) pt-0.5 [scrollbar-width:thin]">
            {activeQuestion.multiSelect ? (
              <p className="text-chat-meta text-muted-foreground">Select one or more options.</p>
            ) : null}
            <div className="flex flex-col">
              {activeQuestion.options.map((option, index) => {
                const optionValue = option.value ?? option.label;
                const isOptimisticallySelected =
                  optimisticSingleSelect?.questionId === activeQuestion.id &&
                  optimisticSingleSelect.optionValue === optionValue;
                const isSelected =
                  isOptimisticallySelected ||
                  (!customAnswerActive && progress.selectedOptionValues.includes(optionValue));
                const shortcutKey = index < 9 ? index + 1 : null;
                return (
                  <button
                    key={`${activeQuestion.id}:${optionValue}`}
                    type="button"
                    disabled={isResponding}
                    aria-pressed={isSelected}
                    onClick={() => {
                      handleOptionSelection(activeQuestion.id, optionValue);
                    }}
                    className={cn(
                      "flex min-h-6 w-full items-baseline gap-2 rounded-sm px-1 py-0.5 text-left text-chat outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected
                        ? "bg-warning/12 text-foreground"
                        : "text-foreground hover:bg-muted/50",
                      isResponding ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                    )}
                  >
                    <kbd
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center self-center rounded-xs border font-sans text-3xs font-medium tabular-nums",
                        isSelected
                          ? "border-warning/70 bg-warning/25 text-warning-foreground"
                          : "border-border text-muted-foreground",
                        shortcutKey === null && "invisible",
                      )}
                    >
                      {shortcutKey}
                    </kbd>
                    <span className="min-w-0 wrap-anywhere">
                      <span className="font-medium">{option.label}</span>
                      {option.description && option.description !== option.label ? (
                        <span className="text-muted-foreground"> — {option.description}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="pt-0.5 pb-(--chat-gap) text-right text-chat-meta text-muted-foreground">
              or type your own answer below
            </p>
          </div>
        </CollapsiblePanel>
      </div>
    </Collapsible>
  );
});
