import { describe, expect, it } from "vite-plus/test";

import {
  type ComposerStatPillsInput,
  deriveComposerStatPills,
  formatStatPillElapsed,
} from "./ComposerStatPills.logic";

const idle: ComposerStatPillsInput = {
  needsYou: false,
  workingSince: null,
  queuedCount: 0,
  usageWindow: null,
  contextPercent: 31,
  compactAvailable: true,
};

describe("deriveComposerStatPills", () => {
  it("shows only the context pill on an idle thread", () => {
    expect(deriveComposerStatPills(idle)).toEqual([
      { kind: "ctx", label: "ctx 31%", percent: 31, tone: "dim", offersCompact: false },
    ]);
  });

  it("orders needs you, working, queued, usage and keeps ctx last", () => {
    const pills = deriveComposerStatPills({
      ...idle,
      needsYou: true,
      workingSince: "2026-10-05T10:00:00.000Z",
      queuedCount: 2,
      usageWindow: { label: "Session", usedPercent: 92, resetsAt: null },
    });
    expect(pills.map((pill) => pill.kind)).toEqual([
      "needs-you",
      "working",
      "queued",
      "usage",
      "ctx",
    ]);
    expect(pills.find((pill) => pill.kind === "usage")).toMatchObject({
      label: "Session limit 92%",
      tone: "warning",
    });
  });

  it("tones the context pill dim to 80%, amber above and red at the limit", () => {
    const tone = (contextPercent: number) =>
      deriveComposerStatPills({ ...idle, contextPercent }).at(-1);
    expect(tone(80)).toMatchObject({ tone: "dim", offersCompact: false });
    expect(tone(86)).toMatchObject({ tone: "warning", offersCompact: false });
    expect(tone(98)).toMatchObject({ tone: "error", offersCompact: true, label: "ctx 98%" });
  });

  it("says a hit usage limit in words and keeps a quiet window out", () => {
    const hit = deriveComposerStatPills({
      ...idle,
      contextPercent: null,
      usageWindow: { label: "Session", usedPercent: 100, resetsAt: "2026-10-05T23:40:00.000Z" },
    });
    expect(hit).toEqual([
      {
        kind: "usage",
        label: "Session limit hit",
        resetsAt: "2026-10-05T23:40:00.000Z",
        tone: "error",
      },
    ]);
    expect(
      deriveComposerStatPills({
        ...idle,
        usageWindow: { label: "Weekly", usedPercent: 40, resetsAt: null },
      }).map((pill) => pill.kind),
    ).toEqual(["ctx"]);
  });
});

describe("formatStatPillElapsed", () => {
  it("counts seconds, then minutes and seconds", () => {
    const start = "2026-10-05T10:00:00.000Z";
    expect(formatStatPillElapsed(start, Date.parse(start) + 42_000)).toBe("42s");
    expect(formatStatPillElapsed(start, Date.parse(start) + 79_000)).toBe("1m 19s");
  });
});
