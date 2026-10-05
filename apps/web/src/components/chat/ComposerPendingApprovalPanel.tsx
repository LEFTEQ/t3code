import { memo } from "react";
import { type PendingApproval } from "../../session-logic";
import { cn } from "~/lib/utils";
import { ChatGutterRow } from "./ChatGutter";

interface ComposerPendingApprovalPanelProps {
  approval: PendingApproval;
  pendingCount: number;
  className?: string;
}

const APPROVAL_QUESTIONS: Record<PendingApproval["requestKind"], string> = {
  command: "Run this command?",
  "file-read": "Read this file?",
  "file-change": "Apply this change?",
  permission: "Grant this permission?",
  "mcp-elicitation": "Allow app access?",
};

/**
 * The top of the needs-you dock (D7): an amber rule, then "! Run this
 * command?" and the request itself in mono. The decision buttons follow it as
 * `ComposerPendingApprovalActions`, and the prompt below stays usable for
 * redirecting the agent instead.
 */
export const ComposerPendingApprovalPanel = memo(function ComposerPendingApprovalPanel({
  approval,
  pendingCount,
  className,
}: ComposerPendingApprovalPanelProps) {
  const Detail = approval.requestKind === "mcp-elicitation" ? "span" : "code";
  const fallbackLabel =
    approval.requestKind === "mcp-elicitation"
      ? "App access approval"
      : approval.requestKind === "command"
        ? "Command approval"
        : approval.requestKind === "file-read"
          ? "File read approval"
          : approval.requestKind === "permission"
            ? "App permission approval"
            : "File change approval";
  const detailAriaLabel =
    approval.requestKind === "mcp-elicitation"
      ? "App access request"
      : approval.requestKind === "command"
        ? "Command"
        : approval.requestKind === "file-read"
          ? "File to read"
          : approval.requestKind === "permission"
            ? "Permission request"
            : "File change";

  return (
    <div
      aria-label={fallbackLabel}
      className={cn(
        "w-full min-w-0 border-t border-warning/70 bg-linear-to-b from-warning/8 to-transparent pt-(--chat-gap)",
        className,
      )}
      data-chat-needs-you="approval"
      role="group"
    >
      <ChatGutterRow glyph="needs-you" size="prose">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-chat font-semibold text-foreground">
            {APPROVAL_QUESTIONS[approval.requestKind]}
          </span>
          <span className="ml-auto flex min-w-0 shrink items-baseline gap-2 text-chat-meta text-muted-foreground">
            {approval.appName ? <span className="min-w-0 truncate">{approval.appName}</span> : null}
            {pendingCount > 1 ? (
              <span className="shrink-0 tabular-nums">1/{pendingCount}</span>
            ) : null}
          </span>
        </div>
        <Detail
          aria-label={detailAriaLabel}
          className={cn(
            "block max-h-20 w-full min-w-0 overflow-auto rounded-xs text-chat-meta text-foreground [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 [&::-webkit-scrollbar]:h-1.5",
            approval.requestKind === "mcp-elicitation"
              ? "whitespace-pre-wrap font-sans wrap-break-word"
              : "whitespace-pre font-mono",
          )}
          data-approval-detail="complete"
          tabIndex={0}
        >
          {approval.requestKind === "command" && approval.detail ? (
            <span aria-hidden className="select-none text-muted-foreground">
              {"$ "}
            </span>
          ) : null}
          {approval.detail || fallbackLabel}
        </Detail>
      </ChatGutterRow>
    </div>
  );
});
