import { describe, expect, it } from "vite-plus/test";

import {
  COMPOSER_RESTING_EXPANSION_MIN_PX,
  resolveComposerTimelineInset,
  resolveScrollToEndClearance,
  shouldUseRestingComposerLayout,
} from "./composerFooterLayout";

describe("resolveComposerTimelineInset", () => {
  it("follows the expanded overlay height", () => {
    expect(
      resolveComposerTimelineInset({ currentInset: 160, overlayHeight: 140, isResting: false }),
    ).toBe(140);
  });

  it("keeps a larger expanded reservation while resting", () => {
    expect(
      resolveComposerTimelineInset({ currentInset: 200, overlayHeight: 60, isResting: true }),
    ).toBe(200);
  });

  it("reserves the empty expansion when no larger height is known", () => {
    expect(
      resolveComposerTimelineInset({ currentInset: 0, overlayHeight: 60, isResting: true }),
    ).toBe(60 + COMPOSER_RESTING_EXPANSION_MIN_PX);
  });
});

describe("shouldUseRestingComposerLayout", () => {
  const resting = {
    isExistingThread: true,
    isMobileViewport: false,
    isScrollCollapsed: true,
    hasExpandedChrome: false,
    hasMultilinePrompt: false,
    timelineOverflows: true,
  };

  it("uses the resting layout after a timeline scroll", () => {
    expect(shouldUseRestingComposerLayout(resting)).toBe(true);
  });

  it("keeps the composer expanded until the timeline is scrolled", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, isScrollCollapsed: false })).toBe(false);
  });

  it("keeps the composer expanded while the timeline fits above it", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, timelineOverflows: false })).toBe(false);
  });

  it("keeps new-thread composers expanded", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, isExistingThread: false })).toBe(false);
  });

  it("leaves responsive mobile on its existing collapse path", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, isMobileViewport: true })).toBe(false);
  });

  it("keeps drawers and composer-owned menus expanded", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, hasExpandedChrome: true })).toBe(false);
  });

  it.each([false, true])(
    "keeps multiline drafts expanded when scroll collapsed is %s",
    (isScrollCollapsed) => {
      expect(
        shouldUseRestingComposerLayout({
          ...resting,
          hasMultilinePrompt: true,
          isScrollCollapsed,
        }),
      ).toBe(false);
    },
  );
});

describe("resolveScrollToEndClearance", () => {
  it("removes the side tab gap in both composer states while clearing overlapping attachments", () => {
    for (const overlayHeight of [120, 214]) {
      const layout = {
        overlayHeight,
        mainSurfaceTop: 534,
        button: { left: 340, right: 460 },
        attachments: [{ top: 500, left: 600, right: 700 }],
      };
      expect(resolveScrollToEndClearance(layout)).toBe(overlayHeight - 34);
      expect(resolveScrollToEndClearance({ ...layout, attachments: [] })).toBe(overlayHeight);
      expect(
        resolveScrollToEndClearance({
          ...layout,
          attachments: [...layout.attachments, { top: 500, left: 100, right: 700 }],
        }),
      ).toBe(overlayHeight);
      expect(resolveScrollToEndClearance({ ...layout, button: { left: 590, right: 710 } })).toBe(
        overlayHeight,
      );
    }
  });
});
