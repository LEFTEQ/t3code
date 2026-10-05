import { mergeProps } from "@base-ui/react/merge-props";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { useRender } from "@base-ui/react/use-render";
import { ChevronDownIcon, type LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";

export type ComposerControlSize = "sm" | "xs";

/**
 * The composer's control look. `xs` is a segment of the metadata line under the prompt: dim
 * text at the chat meta size that brightens on hover, with a 24px hit area. `sm` is the larger
 * control used outside the composer. `aria-pressed` marks a toggle that is on (plan mode). This
 * is an app control, not a restyled Button, so it owns its classes.
 */
function composerControlClassName(size: ComposerControlSize, className?: string) {
  return cn(
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-(--control-radius) border border-transparent text-base outline-none hover:bg-accent data-pressed:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 data-disabled:pointer-events-none data-disabled:opacity-64 pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 [&:active:not([aria-haspopup])]:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:-mx-0.5 [&_svg[data-composer-control-icon]]:mx-0",
    size === "xs"
      ? "h-(--chat-meta-leading) gap-1 rounded-sm px-0.5 font-normal text-chat-meta text-muted-foreground after:absolute after:top-1/2 after:left-1/2 after:h-(--chat-hit) after:w-full after:min-w-(--chat-hit) after:-translate-1/2 hover:bg-transparent hover:text-foreground data-pressed:bg-transparent data-pressed:text-foreground aria-pressed:text-foreground [&_svg:not([class*='size-'])]:size-3"
      : "h-7 gap-1.5 px-2.5 font-medium text-secondary-label [&_svg:not([class*='text-'])]:text-muted-foreground hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:hover:bg-accent/80 sm:text-sm [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
    className,
  );
}

type ComposerControlProps = useRender.ComponentProps<"button"> & {
  size?: ComposerControlSize;
};

export function ComposerControl({
  className,
  size = "sm",
  render,
  ...props
}: ComposerControlProps) {
  const defaultProps = {
    className: composerControlClassName(size, className),
    type: render ? undefined : ("button" as const),
  };
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

export function ComposerControlIcon({
  icon: Icon,
  className,
  opticalSize = "default",
  size = "sm",
}: {
  icon: LucideIcon;
  className?: string | undefined;
  opticalSize?: "default" | "large";
  size?: ComposerControlSize;
}) {
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "shrink-0",
        size === "xs" ? "size-3" : opticalSize === "large" ? "size-4.5" : "size-4",
        className,
      )}
      data-composer-control-icon
    />
  );
}

export function ComposerControlChevron({
  className,
  size = "sm",
}: {
  className?: string;
  size?: ComposerControlSize;
} = {}) {
  return (
    <ChevronDownIcon
      aria-hidden="true"
      className={cn(
        "shrink-0",
        // Metadata segments read as words; the popup they open is the affordance.
        size === "xs" ? "hidden" : "size-3.5 text-icon-muted",
        className,
      )}
      data-composer-control-chevron
      strokeWidth={2.25}
    />
  );
}

export function ComposerSelectControl({
  className,
  children,
  size = "sm",
  ...props
}: Omit<SelectPrimitive.Trigger.Props, "className"> & {
  className?: string | undefined;
  size?: ComposerControlSize;
}) {
  return (
    <SelectPrimitive.Trigger className={composerControlClassName(size, className)} {...props}>
      {children}
      <SelectPrimitive.Icon>
        <ComposerControlChevron size={size} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}
