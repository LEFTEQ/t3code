import {
  CHAT_TEXT_SCALE_STEP,
  type ChatDensity,
  DEFAULT_CHAT_DENSITY,
  DEFAULT_CHAT_TEXT_SCALE,
  MAX_CHAT_TEXT_SCALE,
  MIN_CHAT_TEXT_SCALE,
} from "@t3tools/contracts";

/**
 * Chat density: the one token set every chat surface (workspace panes and the
 * single-thread view) is sized from. This module owns the values; the root
 * sync writes them onto `<html>` as `--chat-*` variables, and the Appearance
 * preview applies the same record to its own element. index.css only carries
 * the Compact defaults for the first frame before settings hydrate.
 *
 * Components read the tokens through `text-chat` / `text-chat-meta` /
 * `text-chat-label` and `gap-(--chat-gap)`, `px-(--chat-gutter)`,
 * `h-(--chat-row)`, `w-(--chat-glyph)`, `ps-(--chat-content-inset)` and friends.
 */
export interface ChatDensityPreset {
  /** Prose size; line height is 1.5× of it. */
  readonly text: number;
  /** Meta and mono size (role labels' neighbours, work rows, code). */
  readonly meta: number;
  /** Role label size ("You", provider name). */
  readonly label: number;
  /** Gap between rows within a turn. */
  readonly gap: number;
  /** Gap between turns. */
  readonly turnGap: number;
  /** Horizontal inset of the transcript and prompt from the pane edge. */
  readonly gutter: number;
  /** Width of the glyph column before every row. */
  readonly glyph: number;
  /** Height of a one-line work row. */
  readonly row: number;
}

export const CHAT_DENSITY_PRESETS: Readonly<Record<ChatDensity, ChatDensityPreset>> = {
  compact: { text: 13, meta: 12, label: 11, gap: 6, turnGap: 16, gutter: 8, glyph: 14, row: 20 },
  comfortable: {
    text: 14,
    meta: 12,
    label: 11.5,
    gap: 8,
    turnGap: 20,
    gutter: 12,
    glyph: 16,
    row: 22,
  },
  ultra: { text: 12.5, meta: 11, label: 10.5, gap: 4, turnGap: 12, gutter: 6, glyph: 12, row: 18 },
};

export const CHAT_DENSITY_LABELS: Readonly<Record<ChatDensity, string>> = {
  compact: "Compact",
  comfortable: "Comfortable",
  ultra: "Ultra",
};

/** Densest first, so "roomier" walks right and "denser" walks left. */
export const CHAT_DENSITY_ORDER = [
  "ultra",
  "compact",
  "comfortable",
] as const satisfies ReadonlyArray<ChatDensity>;

export function stepChatDensity(
  density: ChatDensity,
  direction: "roomier" | "denser",
): ChatDensity {
  const index = CHAT_DENSITY_ORDER.indexOf(density);
  const next = index + (direction === "roomier" ? 1 : -1);
  return CHAT_DENSITY_ORDER[Math.min(CHAT_DENSITY_ORDER.length - 1, Math.max(0, next))]!;
}

/** The palette's "Cycle chat density": roomier, wrapping from the roomiest back to the densest. */
export function cycleChatDensity(density: ChatDensity): ChatDensity {
  const index = CHAT_DENSITY_ORDER.indexOf(density);
  return CHAT_DENSITY_ORDER[(index + 1) % CHAT_DENSITY_ORDER.length]!;
}

/** The settings ⌃⌘0 and the Appearance reset return to. */
export const DEFAULT_CHAT_DENSITY_SETTINGS = {
  chatDensity: DEFAULT_CHAT_DENSITY,
  chatTextScale: DEFAULT_CHAT_TEXT_SCALE,
} as const;

export function clampChatTextScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CHAT_TEXT_SCALE;
  const stepped = Math.round(value / CHAT_TEXT_SCALE_STEP) * CHAT_TEXT_SCALE_STEP;
  return Math.min(MAX_CHAT_TEXT_SCALE, Math.max(MIN_CHAT_TEXT_SCALE, stepped));
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

/** The `--chat-*` variables for a preset at a text size, ready for `style.setProperty`. */
export function chatDensityVariables(
  density: ChatDensity,
  textScale: number,
): Readonly<Record<`--chat-${string}`, string>> {
  const preset = CHAT_DENSITY_PRESETS[density] ?? CHAT_DENSITY_PRESETS[DEFAULT_CHAT_DENSITY];
  const scale = clampChatTextScale(textScale) / 100;
  return {
    "--chat-text": px(preset.text * scale),
    "--chat-text-leading": px(preset.text * 1.5 * scale),
    "--chat-meta": px(preset.meta * scale),
    "--chat-meta-leading": px(preset.meta * 1.5 * scale),
    "--chat-label": px(preset.label * scale),
    "--chat-gap": px(preset.gap * scale),
    "--chat-turn-gap": px(preset.turnGap * scale),
    "--chat-gutter": px(preset.gutter * scale),
    "--chat-glyph": px(preset.glyph * scale),
    // Where content starts after the glyph column: the glyph plus a 4px gap.
    "--chat-content-inset": px((preset.glyph + 4) * scale),
    "--chat-row": px(preset.row * scale),
  };
}

export function applyChatDensity(root: HTMLElement, density: ChatDensity, textScale: number) {
  root.dataset.chatDensity = density;
  for (const [name, value] of Object.entries(chatDensityVariables(density, textScale))) {
    root.style.setProperty(name, value);
  }
}
