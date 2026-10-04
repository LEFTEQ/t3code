import { describe, expect, it } from "vite-plus/test";

import { scrollLeftToReveal } from "./tabScroll";

describe("scrollLeftToReveal", () => {
  it("scrolls a tab past either edge into view and leaves a visible one alone", () => {
    expect(scrollLeftToReveal({ start: 20, width: 80 }, { scrollLeft: 60, width: 200 })).toBe(20);
    expect(scrollLeftToReveal({ start: 300, width: 80 }, { scrollLeft: 0, width: 200 })).toBe(180);
    expect(scrollLeftToReveal({ start: 40, width: 80 }, { scrollLeft: 0, width: 200 })).toBe(0);
  });

  it("settles when the tab is wider than the strip", () => {
    const tab = { start: 120, width: 160 };
    const first = scrollLeftToReveal(tab, { scrollLeft: 0, width: 100 });
    expect(first).toBe(120);
    expect(scrollLeftToReveal(tab, { scrollLeft: first, width: 100 })).toBe(first);
  });
});
