import { BookmarkIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";
import { ComposerControl } from "./ComposerControl";

/**
 * The stash count as a metadata-line segment; it opens the stash menu.
 *
 * On save the segment gives one quiet acknowledgement: the count ticks over
 * in the primary color. `pulseKey` changes per stash, remounting the count
 * so the transition replays without a continuous animation.
 */
export const ComposerStashBadge = memo(function ComposerStashBadge(props: {
  count: number;
  menuOpen: boolean;
  pulseKey: number;
  pulsing: boolean;
  onToggleMenu: () => void;
}) {
  if (props.count === 0) return null;
  return (
    <ComposerControl
      size="xs"
      data-prompt-stash-badge="true"
      aria-label={`Stashed prompts: ${props.count}. Open stash.`}
      aria-expanded={props.menuOpen}
      className={cn((props.menuOpen || props.pulsing) && "text-foreground")}
      onPointerDown={(event) => event.preventDefault()}
      onClick={props.onToggleMenu}
    >
      <BookmarkIcon />
      <span
        key={props.pulseKey}
        className={cn(
          "tabular-nums",
          props.pulsing &&
            "text-primary transition-[opacity,translate] duration-180 ease-out starting:translate-y-0.5 starting:opacity-0 motion-reduce:transition-none",
        )}
      >
        {props.count}
      </span>
      <span>stashed</span>
    </ComposerControl>
  );
});
