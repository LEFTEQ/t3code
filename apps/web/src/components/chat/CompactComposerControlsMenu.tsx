import { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import { memo, useState, type ReactNode } from "react";
import { EllipsisIcon } from "lucide-react";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "../ui/menu";
import { ComposerControl, ComposerControlIcon } from "./ComposerControl";
import { useComposerMenuProps } from "./composerEventScope";
import { useComposerMenuState } from "./useComposerMenuState";

/** A ⋯ entry that opens one of the composer's own pickers once the menu closes. */
export interface ComposerMenuLauncher {
  readonly id: string;
  readonly label: string;
  readonly shortcutLabel: string | null;
  readonly disabled?: boolean | undefined;
  readonly onSelect: () => void;
}

/**
 * The metadata line's ⋯ menu: every composer control that is at its default
 * and therefore not on the line. Pickers with their own popups (model,
 * workspace, branch) are launchers; effort, mode and access are chosen here
 * directly. Each keeps its keyboard shortcut.
 */
export const CompactComposerControlsMenu = memo(function CompactComposerControlsMenu(props: {
  interactionMode: ProviderInteractionMode;
  runtimeMode: RuntimeMode;
  showInteractionModeToggle: boolean;
  traitsMenuContent?: ReactNode;
  /** Read as the menu opens: which pickers sit at their default right now. */
  getLaunchers: () => ReadonlyArray<ComposerMenuLauncher>;
  onToggleInteractionMode: () => void;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}) {
  const composerFloatingLayerProps = useComposerMenuProps();
  const [open, setOpen] = useComposerMenuState();
  const [launchers, setLaunchers] = useState<ReadonlyArray<ComposerMenuLauncher>>([]);

  return (
    <Menu
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setLaunchers(props.getLaunchers());
        setOpen(nextOpen);
      }}
    >
      <MenuTrigger
        render={<ComposerControl size="xs" className="px-1" aria-label="More composer controls" />}
      >
        <ComposerControlIcon icon={EllipsisIcon} size="xs" />
      </MenuTrigger>
      <MenuPopup align="start" side="top" className="min-w-56" {...composerFloatingLayerProps}>
        {launchers.length > 0 ? (
          <>
            <MenuGroup>
              {launchers.map((launcher) => (
                <MenuItem
                  key={launcher.id}
                  disabled={launcher.disabled}
                  onClick={() => {
                    // Let the menu close and hand focus back first, so the
                    // picker it opens is not dismissed by that focus move.
                    window.setTimeout(launcher.onSelect, 0);
                  }}
                >
                  {launcher.label}
                  {launcher.shortcutLabel ? (
                    <MenuShortcut>{launcher.shortcutLabel}</MenuShortcut>
                  ) : null}
                </MenuItem>
              ))}
            </MenuGroup>
            <MenuSeparator />
          </>
        ) : null}
        {props.traitsMenuContent ? (
          <>
            {props.traitsMenuContent}
            <MenuSeparator />
          </>
        ) : null}
        {props.showInteractionModeToggle ? (
          <>
            <MenuGroup>
              <MenuGroupLabel>Mode</MenuGroupLabel>
              <MenuRadioGroup
                value={props.interactionMode}
                onValueChange={(value) => {
                  if (!value || value === props.interactionMode) return;
                  props.onToggleInteractionMode();
                }}
              >
                <MenuRadioItem value="default">Chat</MenuRadioItem>
                <MenuRadioItem value="plan">Plan</MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
            <MenuSeparator />
          </>
        ) : null}
        <MenuGroup>
          <MenuGroupLabel>Access</MenuGroupLabel>
          <MenuRadioGroup
            value={props.runtimeMode}
            onValueChange={(value) => {
              if (!value || value === props.runtimeMode) return;
              props.onRuntimeModeChange(value as RuntimeMode);
            }}
          >
            <MenuRadioItem value="approval-required">Supervised</MenuRadioItem>
            <MenuRadioItem value="auto-accept-edits">Auto-accept edits</MenuRadioItem>
            <MenuRadioItem value="auto">Auto</MenuRadioItem>
            <MenuRadioItem value="full-access">Full access</MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
});
