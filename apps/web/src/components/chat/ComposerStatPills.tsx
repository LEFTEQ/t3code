import type { TimestampFormat } from "@t3tools/contracts";
import { memo, useEffect, useRef, useState } from "react";

import type { ContextWindowSnapshot } from "~/lib/contextWindow";
import { cn } from "~/lib/utils";
import { formatShortTimestamp } from "../../timestampFormat";
import { ContextWindowMeter } from "./ContextWindowMeter";
import {
  type ComposerStatPill,
  type ComposerStatPillTone,
  formatStatPillElapsed,
} from "./ComposerStatPills.logic";

// 18px tall with a 26px hit; the 3px background ring cuts each pill out of the
// transcript line it floats over.
const PILL_CLASS =
  "pointer-events-auto relative inline-flex h-[18px] items-center gap-1 rounded-full border bg-background px-1.5 text-chat-label leading-none whitespace-nowrap tabular-nums ring-3 ring-background";

const PILL_TONES: Record<ComposerStatPillTone, string> = {
  dim: "border-border text-muted-foreground",
  info: "border-info/45 text-info-foreground",
  warning: "border-warning/55 text-warning-foreground",
  error: "border-error/55 text-error-foreground",
};

/** Ticks the Working pill once a second by rewriting its text, so the pill never re-renders. */
function PillTimer({ since }: { readonly since: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const update = () => {
      if (textRef.current) textRef.current.textContent = formatStatPillElapsed(since, Date.now());
    };
    update();
    const id = window.setInterval(update, 1_000);
    return () => window.clearInterval(id);
  }, [since]);
  // The effect rewrites this on mount and every tick; the first paint needs a value.
  const [initialText] = useState(() => formatStatPillElapsed(since, Date.now()));
  return <span ref={textRef}>{initialText}</span>;
}

function StatPillContent({
  pill,
  timestampFormat,
}: {
  readonly pill: Exclude<ComposerStatPill, { kind: "ctx" }>;
  readonly timestampFormat: TimestampFormat;
}) {
  switch (pill.kind) {
    case "working":
      return (
        <>
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-info" />
          Working <PillTimer since={pill.since} />
        </>
      );
    case "usage":
      return (
        <>
          {pill.label}
          {pill.resetsAt
            ? ` · resets ${formatShortTimestamp(pill.resetsAt, timestampFormat)}`
            : null}
        </>
      );
    case "needs-you":
    case "queued":
      return pill.label;
  }
}

/**
 * The stat pills (D12): a zero-height group at the transcript's bottom-right,
 * just above the prompt rule or the needs-you dock. Only the ctx pill is
 * interactive; it opens the context window popover with its Compact action.
 */
export const ComposerStatPills = memo(function ComposerStatPills({
  pills,
  contextWindow,
  modelDisplayName,
  onCompact,
  compactDisabled,
  compactDisabledReason,
  timestampFormat,
  className,
}: {
  readonly pills: ReadonlyArray<ComposerStatPill>;
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly modelDisplayName: string | null;
  readonly onCompact?: (() => void) | undefined;
  readonly compactDisabled: boolean;
  readonly compactDisabledReason: string | null;
  readonly timestampFormat: TimestampFormat;
  readonly className?: string | undefined;
}) {
  if (pills.length === 0) return null;
  return (
    <div
      data-chat-stat-pills
      className={cn("pointer-events-none flex items-center justify-end gap-1", className)}
    >
      {pills.map((pill) =>
        pill.kind === "ctx" ? (
          contextWindow ? (
            <ContextWindowMeter
              key={pill.kind}
              usage={contextWindow}
              modelDisplayName={modelDisplayName}
              onCompact={onCompact}
              compactDisabled={compactDisabled}
              compactDisabledReason={compactDisabledReason}
              trigger={
                <button
                  type="button"
                  aria-label={`Context window ${pill.label.replace("ctx ", "")} used`}
                  data-stat-pill={pill.kind}
                  className={cn(
                    PILL_CLASS,
                    PILL_TONES[pill.tone],
                    "cursor-pointer outline-none before:absolute before:-inset-x-0.5 before:-inset-y-1 before:content-[''] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                  )}
                >
                  {pill.label}
                  {pill.offersCompact ? " · Compact" : null}
                </button>
              }
            />
          ) : null
        ) : (
          <span
            key={pill.kind}
            data-stat-pill={pill.kind}
            className={cn(PILL_CLASS, PILL_TONES[pill.tone])}
          >
            <StatPillContent pill={pill} timestampFormat={timestampFormat} />
          </span>
        ),
      )}
    </div>
  );
});
