import type { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

/**
 * The composer's metadata line: the dim row under the prompt. It names the
 * project and then only what differs from the user's configured defaults —
 * a default carries no information. Everything else lives in the ⋯ menu and
 * keeps its shortcut.
 *
 * Model and branch normally live on the pane's tab chip, so they appear here
 * only outside a workspace pane, where nothing else shows them.
 */
export type ComposerMetadataSegment =
  | "project"
  | "model"
  | "branch"
  | "plan"
  | "access"
  | "effort"
  | "host"
  | "worktree"
  | "stash"
  | "more";

export interface ComposerMetadataInput {
  /** Rendered inside a workspace pane, whose tab chip already shows model and branch. */
  readonly inPane: boolean;
  readonly interactionMode: ProviderInteractionMode;
  readonly runtimeMode: RuntimeMode;
  /** The project's configured `defaultRuntimeMode`. */
  readonly defaultRuntimeMode: RuntimeMode;
  /** The provider's primary option (reasoning effort) differs from the model's default. */
  readonly effortChanged: boolean;
  /** The thread runs on an environment other than the primary one. */
  readonly otherHost: boolean;
  /** The thread runs, or will start, in a worktree. */
  readonly worktree: boolean;
  /** The project is a Git checkout, so a branch exists to show. */
  readonly hasBranch: boolean;
  /** Prompts wait in the stash. */
  readonly stashed: boolean;
}

export function resolveComposerMetadataSegments(
  input: ComposerMetadataInput,
): ReadonlyArray<ComposerMetadataSegment> {
  const segments: ComposerMetadataSegment[] = ["project"];
  if (!input.inPane) {
    segments.push("model");
    if (input.hasBranch) segments.push("branch");
  }
  if (input.interactionMode === "plan") segments.push("plan");
  if (input.runtimeMode !== input.defaultRuntimeMode) segments.push("access");
  if (input.effortChanged) segments.push("effort");
  if (input.otherHost) segments.push("host");
  if (input.worktree) segments.push("worktree");
  if (input.stashed) segments.push("stash");
  segments.push("more");
  return segments;
}

/**
 * Flex `order` for a segment, so segments rendered by different owners (the
 * composer and the branch toolbar's portal) still read in one sequence.
 */
export function composerMetadataSegmentOrder(segment: ComposerMetadataSegment): number {
  return SEGMENT_ORDER.indexOf(segment);
}

const SEGMENT_ORDER: ReadonlyArray<ComposerMetadataSegment> = [
  "project",
  "model",
  "branch",
  "plan",
  "access",
  "effort",
  "host",
  "worktree",
  "stash",
  "more",
];
