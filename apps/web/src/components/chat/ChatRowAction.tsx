import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

const TONES = {
  default: "text-foreground",
  accent: "text-info-foreground",
  muted: "text-muted-foreground hover:text-foreground",
} as const;

/**
 * A text action on a flat chat row — "Review ›", "Copy details", "Dismiss",
 * "Show full plan": plain words in the meta size with no frame, and a hit
 * area grown to 24px around the line so a dense row stays easy to click.
 */
export function ChatRowAction({
  tone = "default",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { readonly tone?: keyof typeof TONES | undefined }) {
  return (
    <button
      type={type}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-sm text-chat-meta font-medium whitespace-nowrap underline-offset-2 outline-none before:absolute before:-inset-x-1 before:top-1/2 before:h-(--chat-hit) before:-translate-y-1/2 before:content-[''] hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64 [&_svg]:size-3 [&_svg]:shrink-0",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
