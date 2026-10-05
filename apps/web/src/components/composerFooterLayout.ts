// The composer no longer rests or folds: it is always the ruled prompt line
// plus one metadata line. What remains here is the timeline-side geometry the
// chat view still reads, and the resting predicate a timeline test still uses.
// `shouldUseRestingComposerLayout`, `resolveComposerTimelineInset`'s
// `isResting` input and `COMPOSER_RESTING_EXPANSION_MIN_PX` go once those
// callers drop them.

export function shouldUseRestingComposerLayout(input: {
  isExistingThread: boolean;
  isMobileViewport: boolean;
  isScrollCollapsed: boolean;
  hasExpandedChrome: boolean;
  hasMultilinePrompt: boolean;
  /** Whether the timeline has more content than fits above the composer. */
  timelineOverflows: boolean;
}): boolean {
  return (
    input.isExistingThread &&
    !input.isMobileViewport &&
    input.timelineOverflows &&
    input.isScrollCollapsed &&
    !input.hasMultilinePrompt &&
    !input.hasExpandedChrome
  );
}

export const COMPOSER_RESTING_EXPANSION_MIN_PX = 94;

/** The space the timeline reserves at its end for the composer overlay. */
export function resolveComposerTimelineInset(input: {
  currentInset: number;
  overlayHeight: number;
  isResting: boolean;
}): number {
  return input.isResting
    ? Math.max(input.currentInset, input.overlayHeight + COMPOSER_RESTING_EXPANSION_MIN_PX)
    : input.overlayHeight;
}

export function resolveScrollToEndClearance(input: {
  overlayHeight: number;
  mainSurfaceTop: number;
  button: { left: number; right: number };
  attachments: ReadonlyArray<{ top: number; left: number; right: number }>;
}): number {
  let contentTop = input.mainSurfaceTop;
  let top = contentTop;
  for (const attachment of input.attachments) {
    contentTop = Math.min(contentTop, attachment.top);
    if (attachment.left < input.button.right && attachment.right > input.button.left) {
      top = Math.min(top, attachment.top);
    }
  }
  return Math.ceil(input.overlayHeight - (top - contentTop));
}
