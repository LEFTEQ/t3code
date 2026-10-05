import { createContext, use, useMemo, useState, type ComponentProps } from "react";

import { cn } from "~/lib/utils";
import { type ComposerMetadataSegment, composerMetadataSegmentOrder } from "./composerMetadata";

interface ComposerMetadataSlot {
  readonly element: HTMLElement | null;
  readonly attach: (element: HTMLElement | null) => void;
}

const ComposerMetadataSlotContext = createContext<ComposerMetadataSlot | null>(null);

/**
 * The composer column. It is flat and opaque (the composer sits over the
 * transcript's end), and it lets the composer's metadata line publish itself
 * so the branch toolbar, mounted beside the composer by the chat view, can
 * portal its workspace segments into that one line.
 */
function Shell({ className, ...props }: ComponentProps<"div">) {
  const [element, attach] = useState<HTMLElement | null>(null);
  const slot = useMemo(() => ({ element, attach }), [element]);
  return (
    <ComposerMetadataSlotContext value={slot}>
      <div
        data-slot="composer-shell"
        className={cn("relative mx-auto w-full max-w-(--chat-max-width) bg-background", className)}
        {...props}
      />
    </ComposerMetadataSlotContext>
  );
}

function Host({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="composer-host" className={cn("relative w-full", className)} {...props} />;
}

function Main({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-chat-composer-main-surface="true" className={cn("relative", className)} {...props} />
  );
}

/** The metadata line's element, or null outside a composer shell or before it mounts. */
export function useComposerMetadataSlot(): ComposerMetadataSlot | null {
  return use(ComposerMetadataSlotContext);
}

/**
 * One metadata-line segment, placed by its `order` so segments from the
 * composer and the branch toolbar read as one sequence. A `hidden` segment
 * holds a control at its default: it stays mounted as an invisible anchor so
 * its shortcut, the ⋯ launcher and its popup still work.
 */
function Segment({
  segment,
  hidden = false,
  className,
  ...props
}: ComponentProps<"span"> & {
  segment: ComposerMetadataSegment;
  hidden?: boolean | undefined;
}) {
  return (
    <span
      data-composer-metadata-segment={segment}
      data-composer-control-anchor={hidden || undefined}
      style={{ order: composerMetadataSegmentOrder(segment) }}
      className={cn(
        "flex min-w-0 shrink items-center",
        segment !== "project" && "before:me-1.5 before:text-icon-muted before:content-['·']",
        hidden && "invisible absolute start-0 bottom-0 before:hidden",
        className,
      )}
      {...props}
    />
  );
}

export const ComposerSurface = { Shell, Host, Main, Segment };
