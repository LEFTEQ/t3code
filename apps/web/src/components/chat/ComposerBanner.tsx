import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ChevronDownIcon, XIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";

export type ComposerBannerVariant = "default" | "error" | "info" | "success" | "warning";

/**
 * Notices above the prompt line, in the chat's Document grammar: a hairline,
 * then one row whose glyph sits in the transcript's gutter column and whose
 * words carry the meaning. The variant only tints the glyph.
 *
 * `attached` rows sit in the composer column above the prompt (opaque, so the
 * transcript never shows through); `floating` is a popover-like surface for
 * notices revealed from the stack.
 */
function Surface({
  placement = "attached",
  variant = "default",
  className,
  ...props
}: ComponentProps<"div"> & {
  placement?: "attached" | "floating";
  variant?: ComposerBannerVariant;
}) {
  return (
    <div
      data-composer-banner-surface={placement}
      data-variant={variant}
      className={cn(
        "group/banner relative isolate bg-background [--chat-composer-attachment-overlap:0px]",
        placement === "attached"
          ? "border-t border-border"
          : "rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
        className,
      )}
      {...props}
    />
  );
}

/** Reveals the notices behind the front one: a quiet count, not a second card. */
function Peek({
  className,
  variant: _variant = "default",
  ...props
}: ComponentProps<"button"> & { variant?: ComposerBannerVariant }) {
  return (
    <button
      type="button"
      data-slot="composer-banner-peek"
      className={cn(
        "relative flex h-(--chat-row) w-full cursor-pointer items-center border-t border-border ps-(--chat-content-inset) text-start text-chat-meta text-muted-foreground outline-none after:absolute after:inset-x-0 after:top-1/2 after:h-full after:min-h-(--chat-hit) after:-translate-y-1/2 hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...props}
    />
  );
}

function Attachment({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="composer-banner-attachment" className={cn("w-full", className)} {...props} />
  );
}

function Dock({ className, ...props }: ComponentProps<"div">) {
  return (
    <Attachment
      className={cn(
        "flex items-stretch not-has-data-[composer-banner-surface=attached]:hidden",
        className,
      )}
      {...props}
    />
  );
}

/** Attachments share a column while a neighboring tab keeps its own cell. */
function Column({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-1 flex-col empty:hidden", className)} {...props} />;
}

function Root({
  className,
  density: _density = "default",
  placement = "attached",
  variant = "default",
  width = "fill",
  ...props
}: ComponentProps<"div"> & {
  density?: "default" | "comfortable" | "spacious";
  placement?: "attached" | "floating";
  variant?: ComposerBannerVariant;
  width?: "fill" | "content";
}) {
  return (
    <Surface
      className={cn(
        "min-w-0 py-0.5 text-chat-meta [--composer-banner-icon-column:var(--chat-glyph)]",
        width === "content" ? "w-fit max-w-full flex-none" : "@container",
        className,
      )}
      data-slot="composer-banner"
      placement={placement}
      data-composer-banner-width={width}
      variant={variant}
      {...props}
    />
  );
}

/** The same row can be a status, a list item, or an entire disclosure button. */
function Row({
  className,
  render,
  layout = "inline",
  ...props
}: useRender.ComponentProps<"div"> & {
  layout?: "inline" | "wrap-actions" | "wrap-actions-narrow" | "approval";
}) {
  const rowProps = {
    className: cn(
      "group/banner-row grid min-h-(--chat-row) w-full min-w-0 grid-cols-[var(--composer-banner-icon-column)_minmax(0,1fr)_auto] items-center gap-x-1 text-start",
      "not-has-[>[data-slot=composer-banner-actions]]:grid-cols-[var(--composer-banner-icon-column)_minmax(0,1fr)]",
      "[&:is(button)]:cursor-pointer [&:is(button)]:focus-visible:outline-2 [&:is(button)]:focus-visible:-outline-offset-2 [&:is(button)]:focus-visible:outline-ring",
      (layout === "wrap-actions" || layout === "approval") &&
        "@max-[400px]:*:data-[slot=composer-banner-content]:min-h-(--chat-row)",
      layout === "wrap-actions-narrow" &&
        "@max-[320px]:*:data-[slot=composer-banner-content]:min-h-(--chat-row)",
      layout === "approval" && "items-start gap-y-1",
      className,
    ),
    "data-composer-banner-row": "true",
    "data-composer-banner-layout": layout,
  };
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(rowProps, props),
  });
}

/** The row's glyph in the gutter column; only warnings and errors take color. */
function Icon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="composer-banner-icon"
      className={cn(
        "col-start-1 row-start-1 flex w-(--composer-banner-icon-column) min-w-0 flex-none items-center justify-center text-icon-muted [&>svg]:size-3",
        "group-data-[variant=warning]/banner:text-warning-foreground group-data-[variant=error]/banner:text-error-foreground group-data-[variant=info]/banner:text-info-foreground",
        className,
      )}
      {...props}
    />
  );
}

function Content({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="composer-banner-content"
      className={cn(
        "col-start-2 row-start-1 flex min-w-0 items-center gap-1 *:data-[slot=composer-banner-separator]:mx-0",
        "@max-[400px]:group-data-[composer-banner-layout=approval]/banner-row:col-end-4",
        "group-not-has-[>[data-slot=composer-banner-icon]]/banner-row:col-[1/3] group-not-has-[>[data-slot=composer-banner-icon]]/banner-row:ps-(--chat-content-inset)",
        className,
      )}
      {...props}
    />
  );
}

function Separator() {
  return (
    <span
      aria-hidden
      data-slot="composer-banner-separator"
      className="mx-1 inline-block flex-none text-icon-muted"
    >
      ·
    </span>
  );
}

function Actions({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="composer-banner-actions"
      className={cn(
        "col-start-3 row-start-1 flex flex-wrap items-center justify-end gap-1",
        "@max-[400px]:group-data-[composer-banner-layout=approval]/banner-row:col-start-2 @max-[400px]:group-data-[composer-banner-layout=approval]/banner-row:col-end-4 @max-[400px]:group-data-[composer-banner-layout=approval]/banner-row:row-start-2 @max-[400px]:group-data-[composer-banner-layout=approval]/banner-row:justify-start",
        "@max-[400px]:group-data-[composer-banner-layout=wrap-actions]/banner-row:has-[>:nth-child(2)]:col-start-2 @max-[400px]:group-data-[composer-banner-layout=wrap-actions]/banner-row:has-[>:nth-child(2)]:col-end-4 @max-[400px]:group-data-[composer-banner-layout=wrap-actions]/banner-row:has-[>:nth-child(2)]:row-start-2 @max-[400px]:group-data-[composer-banner-layout=wrap-actions]/banner-row:has-[>:nth-child(2)]:justify-end",
        "@max-[320px]:group-data-[composer-banner-layout=wrap-actions-narrow]/banner-row:has-[>:nth-child(2)]:col-start-2 @max-[320px]:group-data-[composer-banner-layout=wrap-actions-narrow]/banner-row:has-[>:nth-child(2)]:col-end-4 @max-[320px]:group-data-[composer-banner-layout=wrap-actions-narrow]/banner-row:has-[>:nth-child(2)]:row-start-2 @max-[320px]:group-data-[composer-banner-layout=wrap-actions-narrow]/banner-row:has-[>:nth-child(2)]:justify-start",
        className,
      )}
      {...props}
    />
  );
}

/** Child rows keep their parent's columns and begin immediately after its header. */
function Children({ className, render, ...props }: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">({ className: cn("grid", className) }, props),
  });
}

/** Bounded banner content uses the app's scroll area and fades only overflowing edges. */
function Scroll({ className, children, ...props }: ComponentProps<typeof ScrollArea>) {
  return (
    <ScrollArea
      radius="none"
      scrollFade
      className={cn("h-auto max-h-[min(24rem,40dvh)]", className)}
      {...props}
    >
      {/* Clears the overlay scrollbar only once there is something to scroll. */}
      <div className="[[data-has-overflow-y]>&]:pe-2">{children}</div>
    </ScrollArea>
  );
}

function Count({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex min-w-(--composer-banner-icon-column,1em) flex-none justify-center font-medium text-muted-foreground tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

/** Body text aligned with the content column, under its row. */
function Body({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-w-0 ps-(--chat-content-inset)", className)} {...props} />;
}

function Dot({ className, ...props }: ComponentProps<"span">) {
  return (
    <span className={cn("size-1.5 flex-none rounded-full bg-current", className)} {...props} />
  );
}

// Decorative: the row itself is the control, so this only matches Dismiss's box.
function ToggleIcon({ expanded }: { expanded: boolean }) {
  return (
    <Button
      render={<span aria-hidden />}
      size="icon-xs"
      variant="ghost"
      tabIndex={-1}
      className="pointer-events-none"
    >
      <ChevronDownIcon className={cn("size-3.5", !expanded && "rotate-180")} />
    </Button>
  );
}

function Dismiss({ className, children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button size="icon-xs" variant="ghost" className={className} {...props}>
      {children ?? <XIcon className="size-3.5" />}
    </Button>
  );
}

export const ComposerBanner = {
  Surface,
  Peek,
  Attachment,
  Dock,
  Column,
  Root,
  Row,
  Icon,
  Content,
  Separator,
  Actions,
  Children,
  Scroll,
  Count,
  Body,
  Dot,
  ToggleIcon,
  Dismiss,
};
