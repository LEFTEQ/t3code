import type { ComponentProps, ReactNode } from "react";

import { cn } from "~/lib/utils";

/**
 * The Document grammar's semantic gutter. Every chat row — your messages, work
 * rows, plans, changed files, errors, the needs-you dock, queued messages and
 * the prompt line — puts one glyph in a fixed `--chat-glyph` column so speakers
 * and states line up without bubbles or cards.
 *
 * A glyph never carries meaning by color alone: the row always says it in
 * words too ("Failed", "Run this command?", "Queued"). Glyphs are static; a
 * running row shows ◑, never an animation.
 */
export type ChatGlyph =
  | "you"
  | "action"
  | "result"
  | "running"
  | "failed"
  | "needs-you"
  | "queued"
  | "info";

const GLYPH_CHARACTERS: Record<ChatGlyph, string> = {
  you: "›",
  action: "•",
  result: "└",
  running: "◑",
  failed: "×",
  "needs-you": "!",
  queued: "○",
  info: "•",
};

// Glyphs may sit at ≥3:1 (they are never the only signal); text beside them
// keeps ≥4.5:1. Only running, failed and needs-you take color.
const GLYPH_TONES: Record<ChatGlyph, string> = {
  you: "text-muted-foreground",
  action: "text-icon-muted",
  result: "text-icon-muted",
  running: "text-info-foreground",
  failed: "text-error-foreground",
  "needs-you": "text-warning-foreground font-semibold",
  queued: "text-muted-foreground",
  info: "text-info-foreground",
};

export function ChatGlyphMark({
  glyph,
  className,
}: {
  readonly glyph: ChatGlyph;
  readonly className?: string | undefined;
}) {
  return (
    <span aria-hidden className={cn("select-none", GLYPH_TONES[glyph], className)}>
      {GLYPH_CHARACTERS[glyph]}
    </span>
  );
}

/**
 * One gutter row: the glyph column, then the content. `size` picks whose line
 * box the glyph centers on — prose rows (messages, the prompt) or meta rows
 * (work rows, title rows, footers) — so it sits on the first line either way.
 */
export function ChatGutterRow({
  glyph,
  size = "meta",
  glyphClassName,
  className,
  children,
  ...props
}: {
  readonly glyph: ChatGlyph | null;
  readonly size?: "prose" | "meta" | undefined;
  readonly glyphClassName?: string | undefined;
  readonly children: ReactNode;
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      className={cn("grid grid-cols-[var(--chat-glyph)_minmax(0,1fr)] gap-x-1", className)}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "flex items-center justify-center",
          size === "prose"
            ? "h-(--chat-text-leading) text-chat"
            : "h-(--chat-meta-leading) text-chat-meta",
        )}
      >
        {glyph ? <ChatGlyphMark glyph={glyph} className={glyphClassName} /> : null}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** The dim 11px speaker label above a turn's first row ("You", "Claude"), aligned with the content column. */
export function ChatRoleLabel({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "ps-[calc(var(--chat-glyph)+0.25rem)] text-chat-label font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
