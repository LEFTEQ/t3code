import { type ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { memo } from "react";
import { XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { formatProviderDriverKindLabel } from "../../providerModels";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ChatGutterRow } from "./ChatGutter";
import { ChatRowAction } from "./ChatRowAction";

/** Unsupported and broken versions fail mid-turn, so they warn even when ready. */
function getIncompatibleVersion(status: ServerProvider) {
  const compatibility = status.compatibilityAdvisory;
  return compatibility?.status === "unsupported" || compatibility?.status === "broken"
    ? compatibility
    : null;
}

export function getProviderStatusBannerKey(status: ServerProvider | null): string | null {
  if (!status || status.status === "disabled") return null;
  if (status.status === "ready") {
    const incompatible = getIncompatibleVersion(status);
    return incompatible
      ? [status.instanceId, incompatible.status, status.version ?? ""].join("\u0000")
      : null;
  }
  // Antigravity checks saved credentials when a session starts. Its local
  // health check leaves auth unknown after a restart, which is not a failure.
  if (
    status.driver === "antigravity" &&
    status.installed &&
    status.status === "warning" &&
    status.auth.status === "unknown"
  ) {
    return null;
  }
  return [status.instanceId, status.status, status.auth.status, status.message ?? ""].join(
    "\u0000",
  );
}

export function shouldShowProviderStatusBanner(
  status: ServerProvider | null,
  dismissedBannerKey: string | null,
): boolean {
  const bannerKey = getProviderStatusBannerKey(status);
  return bannerKey !== null && bannerKey !== dismissedBannerKey;
}

export function hasProviderSetup(status: ServerProvider): boolean {
  return (
    status.driver === "antigravity" ||
    status.setup?.canAuthenticate === true ||
    status.setup?.canInstall === true
  );
}

/** Keep the environment's error intact in both the banner and model picker. */
export function getProviderStatusMessage(status: ServerProvider): string {
  if (status.message) return status.message;
  const providerName = status.displayName?.trim() || formatProviderDriverKindLabel(status.driver);
  if (!status.installed && hasProviderSetup(status)) {
    return `Open provider setup to install ${formatProviderDriverKindLabel(status.driver)} on this environment.`;
  }
  if (status.auth.status === "unauthenticated") {
    if (hasProviderSetup(status)) {
      return status.driver === "antigravity"
        ? "Open provider setup to sign in with Google."
        : "Open provider setup to sign in.";
    }
    return "Sign in via the CLI to authenticate again.";
  }
  return status.status === "ready"
    ? "No models are available for this provider."
    : status.status === "error"
      ? `${providerName} provider is unavailable.`
      : `${providerName} provider has limited availability.`;
}

export const ProviderStatusBanner = memo(function ProviderStatusBanner({
  onDismiss,
  onOpenProviderSetup,
  status,
}: {
  onDismiss: () => void;
  onOpenProviderSetup?: (instanceId: ProviderInstanceId) => void;
  status: ServerProvider | null;
}) {
  if (!status || getProviderStatusBannerKey(status) === null) {
    return null;
  }

  const providerName = status.displayName?.trim() || formatProviderDriverKindLabel(status.driver);
  const isUnauthenticated = status.status === "error" && status.auth.status === "unauthenticated";
  const incompatible = status.status === "ready" ? getIncompatibleVersion(status) : null;
  const title = isUnauthenticated
    ? `${providerName} is unauthenticated`
    : incompatible
      ? `${providerName} ${status.version ?? ""} is ${incompatible.status === "broken" ? "known to be broken" : "unsupported"}`
      : `${providerName} provider status`;
  const message = incompatible?.message ?? getProviderStatusMessage(status);
  const isWarning = status.status === "warning" || incompatible !== null;

  // One flat row over the top of the transcript: the title says what is wrong
  // in words, the message follows dim on the same line (full text on hover).
  // Opaque with a hairline below so it reads over the conversation it covers.
  return (
    <div
      role={incompatible && incompatible.status !== "broken" ? "status" : "alert"}
      className="pointer-events-auto border-b border-border/70 bg-background"
    >
      <ChatGutterRow
        glyph={isWarning ? "info" : "failed"}
        glyphClassName={isWarning ? "text-warning-foreground" : undefined}
        className="mx-auto w-full max-w-(--chat-max-width) items-center px-(--chat-gutter) py-0.5"
      >
        <div className="flex min-h-6 min-w-0 items-center gap-3">
          <Tooltip>
            <TooltipTrigger render={<p className="min-w-0 flex-1 truncate text-chat-meta" />}>
              <span
                className={
                  isWarning
                    ? "font-medium text-warning-foreground"
                    : "font-medium text-error-foreground"
                }
              >
                {title}
              </span>
              <span className="text-muted-foreground"> — {message}</span>
            </TooltipTrigger>
            <TooltipPopup side="top" className="whitespace-pre-wrap">
              {message}
            </TooltipPopup>
          </Tooltip>
          {onOpenProviderSetup && hasProviderSetup(status) ? (
            <ChatRowAction tone="accent" onClick={() => onOpenProviderSetup(status.instanceId)}>
              Open provider setup
            </ChatRowAction>
          ) : null}
          <Button
            aria-label={`Dismiss ${providerName} provider ${status.status}`}
            onClick={onDismiss}
            size="icon-xs"
            variant="ghost-muted"
          >
            <XIcon />
          </Button>
        </div>
      </ChatGutterRow>
    </div>
  );
});
