import { memo } from "react";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { ChatGutterRow } from "./ChatGutter";
import { ChatRowAction } from "./ChatRowAction";

export function getThreadErrorBannerKey(threadKey: string, error: string | null): string | null {
  return error === null ? null : `${threadKey}\u0000${error}`;
}

export function shouldShowThreadErrorBanner(
  threadKey: string,
  error: string | null,
  isDismissed: boolean,
): boolean {
  return getThreadErrorBannerKey(threadKey, error) !== null && !isDismissed;
}

// Session-scoped (module-level so it survives ChatView remounts, e.g. route
// changes between threads). Mirrors the branch-mismatch banner: a dismissal
// is remembered per thread key plus message, so navigating away to a thread
// with no error cannot resurrect the banner, while a different error message
// on the same thread still appears.
const sessionDismissedThreadErrorBannerKeys = new Set<string>();

export function dismissThreadErrorBannerForSession(bannerKey: string | null): void {
  if (bannerKey !== null) {
    sessionDismissedThreadErrorBannerKeys.add(bannerKey);
  }
}

export function isThreadErrorBannerDismissedForSession(bannerKey: string | null): boolean {
  return bannerKey !== null && sessionDismissedThreadErrorBannerKeys.has(bannerKey);
}

/**
 * The thread's error as one flat × row over the top of the transcript: the
 * first line of the error as its title, the rest dim beneath it, then plain
 * text actions. Opaque, with a hairline below, so it reads over the
 * conversation it covers.
 */
export const ThreadErrorBanner = memo(function ThreadErrorBanner({
  error,
  onDismiss,
}: {
  error: string | null;
  onDismiss?: () => void;
}) {
  if (!error) return null;
  return <ThreadErrorRow error={error} onDismiss={onDismiss} />;
});

function ThreadErrorRow({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss?: (() => void) | undefined;
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    target: "error details",
    onError: (cause) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not copy the error",
          description: cause instanceof Error ? cause.message : "An error occurred while copying.",
        }),
      );
    },
  });
  const [title = error, ...rest] = error.trim().split("\n");
  const detail = rest.join("\n").trim();
  return (
    <div role="alert" className="pointer-events-auto border-b border-border/70 bg-background">
      <ChatGutterRow
        glyph="failed"
        className="mx-auto w-full max-w-(--chat-max-width) px-(--chat-gutter) py-(--chat-gap)"
      >
        <Tooltip>
          <TooltipTrigger
            render={<div className="line-clamp-3 text-chat-meta whitespace-pre-wrap" />}
          >
            <span className="font-medium text-error-foreground">{title}</span>
            {detail ? <span className="block text-muted-foreground">{detail}</span> : null}
          </TooltipTrigger>
          <TooltipPopup side="top" className="whitespace-pre-wrap">
            {error}
          </TooltipPopup>
        </Tooltip>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3">
          <ChatRowAction tone="muted" onClick={() => copyToClipboard(error)}>
            {isCopied ? "Copied" : "Copy details"}
          </ChatRowAction>
          {onDismiss ? (
            <ChatRowAction tone="muted" aria-label="Dismiss error" onClick={onDismiss}>
              Dismiss
            </ChatRowAction>
          ) : null}
        </div>
      </ChatGutterRow>
    </div>
  );
}
