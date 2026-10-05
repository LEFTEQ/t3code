import {
  worktreeSetupStageLabel,
  type WorktreeSetupSnapshot,
  type WorktreeSetupStage,
} from "@t3tools/contracts";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import { ChevronDownIcon, ChevronRightIcon, LaptopIcon, TerminalIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { MiddleTruncate } from "../ui/middle-truncate";
import { cn } from "~/lib/utils";
import { type ChatGlyph, ChatGutterRow } from "./ChatGutter";
import { ChatRowAction } from "./ChatRowAction";

interface WorktreeSetupCardProps {
  snapshot: WorktreeSetupSnapshot;
  /** Interrupts the server-side bootstrap. Hidden once the setup has settled. */
  onCancel: (() => void) | null;
  /** Restarts the same message in the project checkout instead of a worktree. */
  onWorkLocally: (() => void) | null;
  /** Reveals the setup script terminal tab. Null when no script ran. */
  onOpenTerminal: (() => void) | null;
}

function stageElapsedMs(stage: WorktreeSetupStage, nowMs: number): number | null {
  if (!stage.startedAt) return null;
  const start = Date.parse(stage.startedAt);
  const end = stage.endedAt ? Date.parse(stage.endedAt) : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

/**
 * Ticks once a second while any stage runs so elapsed labels stay live
 * without pushing a React commit through the timeline for every second.
 */
function useNowWhile(active: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [active]);
  return nowMs;
}

/** The stage's gutter glyph: static, so a running stage never repaints. */
function stageGlyph(status: WorktreeSetupStage["status"]): ChatGlyph {
  switch (status) {
    case "done":
    case "skipped":
      return "action";
    case "running":
      return "running";
    case "failed":
      return "failed";
    case "warning":
      return "info";
    case "pending":
      return "queued";
  }
}

function stageRowClassName(status: WorktreeSetupStage["status"]): string {
  switch (status) {
    case "failed":
      return "text-destructive-foreground";
    case "warning":
      return "text-warning-foreground";
    case "pending":
      return "text-muted-foreground";
    case "running":
    case "skipped":
    case "done":
      return "text-secondary-label";
  }
}

function headerLabel(snapshot: WorktreeSetupSnapshot): string {
  switch (snapshot.phase) {
    case "running":
      return "Setting up worktree…";
    case "done":
      return snapshot.stages.some((stage) => stage.status === "failed")
        ? "Worktree ready, setup script failed"
        : "Worktree ready";
    case "failed":
      return "Worktree setup failed";
    case "cancelled":
      return "Worktree setup cancelled";
  }
}

/**
 * Occupies the same slot, with the same metrics, as the "Working for" header
 * so the handoff to the agent's turn only swaps the text.
 */
function SetupHeaderRow({
  snapshot,
  totalElapsed,
}: {
  snapshot: WorktreeSetupSnapshot;
  totalElapsed: number | null;
}) {
  const running = snapshot.phase === "running";
  const failed = snapshot.phase === "failed";
  const finishedWithFailedStage =
    snapshot.phase === "done" && snapshot.stages.some((stage) => stage.status === "failed");
  const text = headerLabel(snapshot);
  const tone = failed
    ? "text-destructive-foreground"
    : finishedWithFailedStage
      ? "text-warning-foreground"
      : "text-foreground";
  return (
    <ChatGutterRow
      glyph={running ? "running" : failed || finishedWithFailedStage ? "failed" : "action"}
      glyphClassName={finishedWithFailedStage ? "text-warning-foreground" : undefined}
      className="min-h-6 items-center text-chat-meta tabular-nums"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={cn("min-w-0 truncate font-medium", tone)}>{text}</span>
        {totalElapsed !== null ? (
          <span className="ms-auto shrink-0 text-muted-foreground">
            {formatDuration(totalElapsed)}
          </span>
        ) : null}
      </div>
    </ChatGutterRow>
  );
}

/** One stage, rendered like a live work entry row. */
function StageRow({
  stage,
  nowMs,
  scriptName,
}: {
  stage: WorktreeSetupStage;
  nowMs: number;
  scriptName: string | null;
}) {
  const elapsed = stageElapsedMs(stage, nowMs);
  const label =
    stage.id === "setup-script" && scriptName ? scriptName : worktreeSetupStageLabel(stage.id);
  const running = stage.status === "running";
  const trailing =
    stage.status === "pending"
      ? null
      : stage.status === "skipped"
        ? (stage.detail ?? "skipped")
        : stage.id === "checkout" && running && stage.percent !== null
          ? `${stage.percent}%`
          : stage.detail;
  return (
    <ChatGutterRow
      glyph={stageGlyph(stage.status)}
      glyphClassName={stage.status === "warning" ? "text-warning-foreground" : undefined}
      className={cn(
        "min-h-(--chat-row) items-center text-chat-meta",
        stageRowClassName(stage.status),
      )}
      data-worktree-setup-stage={stage.id}
      data-worktree-setup-status={stage.status}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 shrink-0 truncate">{label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground tabular-nums">
          {trailing}
        </span>
        {elapsed !== null && stage.status !== "skipped" && stage.status !== "pending" ? (
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {formatDuration(elapsed)}
          </span>
        ) : null}
      </div>
    </ChatGutterRow>
  );
}

/** The server keeps this many trailing lines; the box is sized for exactly that. */
const OUTPUT_TAIL_LINES = 4;
const OUTPUT_TAIL_SLOTS = Array.from({ length: OUTPUT_TAIL_LINES }, (_, slot) => slot);

/**
 * Fixed-height window onto the script's last lines. Rows never wrap and the
 * box never grows or shrinks, so streaming output cannot push the timeline
 * around while the script runs.
 */
function OutputTail({ lines, failed }: { lines: ReadonlyArray<string>; failed: boolean }) {
  const rows = OUTPUT_TAIL_SLOTS.map((slot) => ({
    slot,
    line: lines[lines.length - OUTPUT_TAIL_LINES + slot] ?? "",
  }));
  return (
    <ChatGutterRow glyph="result" className="mb-1">
      <pre
        className={cn(
          "overflow-hidden rounded-sm bg-foreground/3.5 px-2 py-0.5 font-mono text-chat-meta select-text",
          failed ? "text-destructive-foreground" : "text-muted-foreground",
        )}
      >
        {rows.map(({ slot, line }) => (
          <div key={slot} className="truncate whitespace-pre">
            {line.length === 0 ? "\u00a0" : line}
          </div>
        ))}
      </pre>
    </ChatGutterRow>
  );
}

function SetupDetails({ snapshot }: { snapshot: WorktreeSetupSnapshot }) {
  return (
    <ChatGutterRow glyph={null} className="mt-0.5 mb-1">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-chat-meta text-muted-foreground">
      {snapshot.branch ? (
        <>
          <dt className="text-foreground/80">Branch</dt>
          <dd className="min-w-0 font-mono">
            <MiddleTruncate value={snapshot.branch} className="flex" />
          </dd>
        </>
      ) : null}
      {snapshot.baseRef ? (
        <>
          <dt className="text-foreground/80">Base</dt>
          <dd className="min-w-0 font-mono">
            <MiddleTruncate value={snapshot.baseRef} className="flex" />
          </dd>
        </>
      ) : null}
      {snapshot.worktreePath ? (
        <>
          <dt className="text-foreground/80">Path</dt>
          <dd className="min-w-0 font-mono">
            <MiddleTruncate value={snapshot.worktreePath} className="flex" />
          </dd>
        </>
      ) : null}
      {snapshot.setupScript ? (
        <>
          <dt className="text-foreground/80">Setup</dt>
          <dd className="truncate font-mono">{snapshot.setupScript.command}</dd>
        </>
      ) : null}
      </dl>
    </ChatGutterRow>
  );
}

/**
 * One-line summary of a settled setup under a live turn. A clean finish is
 * removed from the timeline altogether, so this only renders the outcomes
 * worth keeping: a failed script, a failed setup, or a cancelled one.
 */
function CollapsedSummaryRow({
  snapshot,
  totalElapsed,
}: {
  snapshot: WorktreeSetupSnapshot;
  totalElapsed: number | null;
}) {
  const status: WorktreeSetupStage["status"] =
    snapshot.phase === "failed" || snapshot.phase === "cancelled"
      ? "failed"
      : snapshot.stages.some((stage) => stage.id === "setup-script" && stage.status === "failed")
        ? "failed"
        : "done";
  const label = headerLabel(snapshot);
  return (
    <ChatGutterRow
      glyph={stageGlyph(status)}
      className={cn("min-h-(--chat-row) items-center text-chat-meta", stageRowClassName(status))}
      data-worktree-setup-stage="summary"
      data-worktree-setup-status={status}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {totalElapsed !== null ? (
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {formatDuration(totalElapsed)}
          </span>
        ) : null}
      </div>
    </ChatGutterRow>
  );
}

export function WorktreeSetupCard({
  snapshot,
  onCancel,
  onWorkLocally,
  onOpenTerminal,
  embedded = false,
}: WorktreeSetupCardProps & {
  /**
   * The agent's turn is live and owns the "Working for" header. The stage
   * list stays exactly where it was so the handoff never moves anything; a
   * failed script that outlives the handoff collapses to a single row.
   */
  embedded?: boolean;
}) {
  const running = snapshot.phase === "running";
  const nowMs = useNowWhile(running);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const totalElapsed = (() => {
    const start = Date.parse(snapshot.startedAt);
    const end = snapshot.endedAt ? Date.parse(snapshot.endedAt) : nowMs;
    return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null;
  })();
  const setupStage = snapshot.stages.find((stage) => stage.id === "setup-script");
  const showTerminal = onOpenTerminal && setupStage && setupStage.status !== "pending";
  const collapsed = embedded && !running;
  // While running, the timeline's working row above the card carries the
  // "Setting up worktree…" label (and keeps that slot when the agent takes
  // over). The card only brings its own header for a settled outcome that
  // has no working row to sit under.
  const showHeader = !embedded && !running;
  // The tail box is part of the script row's footprint while the script runs
  // (and after it failed, so the last lines explain the failure). It mounts
  // as soon as the script is running, empty lines and all, so the card takes
  // its final height once instead of growing with each output line.
  const showTail =
    setupStage !== undefined && (setupStage.status === "running" || setupStage.status === "failed");

  return (
    <section aria-label="Worktree setup" data-worktree-setup-phase={snapshot.phase}>
      {showHeader ? <SetupHeaderRow snapshot={snapshot} totalElapsed={totalElapsed} /> : null}
      {collapsed ? (
        <CollapsedSummaryRow snapshot={snapshot} totalElapsed={totalElapsed} />
      ) : (
        <div className={showHeader ? "pt-0.5" : undefined}>
          {snapshot.stages.map((stage) => (
            <div key={stage.id}>
              <StageRow
                stage={stage}
                nowMs={nowMs}
                scriptName={snapshot.setupScript?.name ?? null}
              />
              {stage.id === "setup-script" && showTail ? (
                <OutputTail lines={stage.tail} failed={stage.status === "failed"} />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {snapshot.phase === "failed" && snapshot.error ? (
        <ChatGutterRow glyph={null} className="mt-0.5">
          <p className="text-chat-meta text-muted-foreground">{snapshot.error}</p>
        </ChatGutterRow>
      ) : null}

      {detailsOpen ? <SetupDetails snapshot={snapshot} /> : null}

      <ChatGutterRow glyph={null}>
        <div className="flex min-h-6 flex-wrap items-center gap-x-3">
          <ChatRowAction
            tone="muted"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen ? <ChevronDownIcon aria-hidden /> : <ChevronRightIcon aria-hidden />}
            Details
          </ChatRowAction>
          {showTerminal ? (
            <ChatRowAction onClick={onOpenTerminal}>
              <TerminalIcon aria-hidden />
              Open terminal
            </ChatRowAction>
          ) : null}
          {onWorkLocally ? (
            <ChatRowAction onClick={onWorkLocally}>
              <LaptopIcon aria-hidden />
              Work locally
            </ChatRowAction>
          ) : null}
          {onCancel && running ? (
            <ChatRowAction tone="muted" onClick={onCancel}>
              <XIcon aria-hidden />
              Cancel
            </ChatRowAction>
          ) : null}
        </div>
      </ChatGutterRow>
    </section>
  );
}
