import { describe, expect, it } from "vite-plus/test";

import {
  CHAT_DENSITY_PRESETS,
  DEFAULT_CHAT_DENSITY_SETTINGS,
  chatDensityVariables,
  clampChatTextScale,
  cycleChatDensity,
  stepChatDensity,
} from "./chatDensity";

describe("CHAT_DENSITY_PRESETS", () => {
  it("sizes each preset as decided", () => {
    const summary = Object.fromEntries(
      Object.entries(CHAT_DENSITY_PRESETS).map(([density, preset]) => [
        density,
        [preset.text, preset.meta, preset.gap, preset.turnGap, preset.gutter, preset.row],
      ]),
    );
    expect(summary).toEqual({
      compact: [13, 12, 6, 16, 8, 20],
      comfortable: [14, 12, 8, 20, 12, 22],
      ultra: [12.5, 11, 4, 12, 6, 18],
    });
  });

  it("scales the whole set with the text size", () => {
    expect(chatDensityVariables("compact", 100)).toMatchObject({
      "--chat-text": "13px",
      "--chat-text-leading": "19.5px",
      "--chat-gap": "6px",
    });
    expect(chatDensityVariables("compact", 120)).toMatchObject({
      "--chat-text": "15.6px",
      "--chat-meta": "14.4px",
      "--chat-row": "24px",
    });
  });
});

describe("stepChatDensity", () => {
  it("walks roomier and denser and clamps at the ends", () => {
    expect(stepChatDensity("compact", "roomier")).toBe("comfortable");
    expect(stepChatDensity("comfortable", "roomier")).toBe("comfortable");
    expect(stepChatDensity("compact", "denser")).toBe("ultra");
    expect(stepChatDensity("ultra", "denser")).toBe("ultra");
  });

  it("cycles back to the densest and resets to Compact at 100%", () => {
    expect(cycleChatDensity("comfortable")).toBe("ultra");
    expect(DEFAULT_CHAT_DENSITY_SETTINGS).toEqual({ chatDensity: "compact", chatTextScale: 100 });
  });
});

describe("clampChatTextScale", () => {
  it("rounds to the 5% step inside 85–130%", () => {
    expect(clampChatTextScale(103)).toBe(105);
    expect(clampChatTextScale(40)).toBe(85);
    expect(clampChatTextScale(400)).toBe(130);
    expect(clampChatTextScale(Number.NaN)).toBe(100);
  });
});
