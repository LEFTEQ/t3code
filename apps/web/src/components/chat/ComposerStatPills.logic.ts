import { formatDuration } from "@t3tools/shared/orchestrationTiming";

/**
 * The stat pills float at the transcript's bottom-right above the prompt rule
 * (D12): they cost no layout height and say only what changed. Order is fixed —
 * Needs you · Working · queued · usage · ctx — so the context percentage always
 * sits rightmost, where the eye finds it across panes.
 */
export type ComposerStatPillTone = "dim" | "info" | "warning" | "error";

export type ComposerStatPill =
  | { readonly kind: "needs-you"; readonly label: string; readonly tone: "warning" }
  | { readonly kind: "working"; readonly since: string; readonly tone: "info" }
  | { readonly kind: "queued"; readonly label: string; readonly tone: "dim" }
  | {
      readonly kind: "usage";
      readonly label: string;
      readonly resetsAt: string | null;
      readonly tone: "warning" | "error";
    }
  | {
      readonly kind: "ctx";
      readonly label: string;
      readonly percent: number;
      readonly tone: ComposerStatPillTone;
      /** At the limit with compaction available: the pill reads "ctx 98% · Compact". */
      readonly offersCompact: boolean;
    };

export interface ComposerStatPillsInput {
  /** A pending approval or question is waiting on the user. */
  readonly needsYou: boolean;
  /** When the running turn started; null while idle. */
  readonly workingSince: string | null;
  readonly queuedCount: number;
  /** The fullest rolling quota window the provider reports, if any. */
  readonly usageWindow: {
    readonly label: string;
    readonly usedPercent: number;
    readonly resetsAt: string | null;
  } | null;
  /** Used share of the context window, 0–100; null hides the pill. */
  readonly contextPercent: number | null;
  readonly compactAvailable: boolean;
}

/** Above this, a pill turns amber. */
export const STAT_PILL_WARNING_PERCENT = 80;
/** Above this the context window is at its limit (red), matching the meter's overload. */
export const CONTEXT_PILL_LIMIT_PERCENT = 90;

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

export function deriveComposerStatPills(input: ComposerStatPillsInput): ComposerStatPill[] {
  const pills: ComposerStatPill[] = [];
  if (input.needsYou) {
    pills.push({ kind: "needs-you", label: "Needs you", tone: "warning" });
  }
  if (input.workingSince !== null) {
    pills.push({ kind: "working", since: input.workingSince, tone: "info" });
  }
  if (input.queuedCount > 0) {
    pills.push({ kind: "queued", label: `${input.queuedCount} queued`, tone: "dim" });
  }
  const usage = input.usageWindow;
  if (usage && usage.usedPercent > STAT_PILL_WARNING_PERCENT) {
    const atLimit = usage.usedPercent >= 100;
    pills.push({
      kind: "usage",
      label: atLimit
        ? `${usage.label} limit hit`
        : `${usage.label} limit ${formatPercent(usage.usedPercent)}`,
      resetsAt: atLimit ? usage.resetsAt : null,
      tone: atLimit ? "error" : "warning",
    });
  }
  if (input.contextPercent !== null && Number.isFinite(input.contextPercent)) {
    const percent = input.contextPercent;
    const atLimit = percent > CONTEXT_PILL_LIMIT_PERCENT;
    pills.push({
      kind: "ctx",
      label: `ctx ${formatPercent(percent)}`,
      percent,
      tone: atLimit ? "error" : percent > STAT_PILL_WARNING_PERCENT ? "warning" : "dim",
      offersCompact: atLimit && input.compactAvailable,
    });
  }
  return pills;
}

/** The Working pill's timer: whole seconds under a minute, then `1m 19s`. */
export function formatStatPillElapsed(sinceIso: string, nowMs: number): string {
  const since = Date.parse(sinceIso);
  if (!Number.isFinite(since)) return "0s";
  const seconds = Math.max(0, Math.floor((nowMs - since) / 1_000));
  return seconds < 60 ? `${seconds}s` : formatDuration(seconds * 1_000);
}
