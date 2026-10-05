import { describe, expect, it } from "vite-plus/test";

import { resolveScrollToEndClearance } from "./composerFooterLayout";

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
