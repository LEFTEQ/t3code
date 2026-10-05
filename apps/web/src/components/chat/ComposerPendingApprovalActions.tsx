import {
  type ApprovalRequestId,
  type ProviderApprovalDecision,
  type ProviderApprovalOption,
} from "@t3tools/contracts";
import { memo } from "react";
import { EllipsisIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { composerFloatingLayerProps } from "./composerEventScope";

interface ComposerPendingApprovalActionsProps {
  requestId: ApprovalRequestId;
  isResponding: boolean;
  options?: ReadonlyArray<ProviderApprovalOption> | undefined;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

const DEFAULT_APPROVAL_OPTIONS = [
  { decision: "accept", label: "Allow once" },
  { decision: "acceptForSession", label: "Allow for session" },
  { decision: "decline", label: "Deny" },
  { decision: "cancel", label: "Cancel" },
] satisfies ReadonlyArray<ProviderApprovalOption>;

// The dock keeps these on screen, in this order; anything else a provider offers
// (cancel the turn, always allow an app) waits behind the ⋯ menu.
const ROW_DECISIONS: ReadonlyArray<ProviderApprovalDecision> = [
  "accept",
  "acceptForSession",
  "decline",
];

/** The needs-you dock's decision row: Allow once (primary), Allow for session, Deny, then ⋯. */
export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  isResponding,
  options = DEFAULT_APPROVAL_OPTIONS,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  const primaryOptions = ROW_DECISIONS.flatMap(
    (decision) => options.find((option) => option.decision === decision) ?? [],
  );
  const moreOptions = options.filter((option) => !ROW_DECISIONS.includes(option.decision));

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1 ps-(--chat-content-inset) pt-(--chat-gap)"
      data-approval-actions
    >
      {primaryOptions.map((option) => {
        const button = (
          <Button
            key={option.decision}
            size="xs"
            variant={option.decision === "accept" ? "warning-outline" : "ghost"}
            disabled={isResponding}
            aria-description={option.warning}
            onClick={() => void onRespondToApproval(requestId, option.decision)}
          >
            {option.warning ? <TriangleAlertIcon className="size-3 shrink-0" /> : null}
            <span className="max-w-40 truncate">{option.label}</span>
          </Button>
        );
        return option.warning ? (
          <Tooltip key={option.decision}>
            <TooltipTrigger render={button} />
            <TooltipPopup side="top">{option.warning}</TooltipPopup>
          </Tooltip>
        ) : (
          button
        );
      })}
      {moreOptions.length > 0 ? (
        <Menu>
          <MenuTrigger
            disabled={isResponding}
            render={
              <Button size="icon-xs" variant="ghost-muted" aria-label="More approval options" />
            }
          >
            <EllipsisIcon />
          </MenuTrigger>
          <MenuPopup {...composerFloatingLayerProps} side="top" align="end">
            {moreOptions.map((option) => {
              const item = (
                <MenuItem
                  key={option.decision}
                  disabled={isResponding}
                  aria-description={option.warning}
                  onClick={() => void onRespondToApproval(requestId, option.decision)}
                  variant="ghost"
                  className="mb-1 last:mb-0"
                >
                  {option.warning ? <TriangleAlertIcon className="size-3 text-warning" /> : null}
                  <span className="min-w-0 whitespace-normal wrap-break-word">{option.label}</span>
                </MenuItem>
              );
              return option.warning ? (
                <Tooltip key={option.decision}>
                  <TooltipTrigger render={item} />
                  <TooltipPopup side="top">{option.warning}</TooltipPopup>
                </Tooltip>
              ) : (
                item
              );
            })}
          </MenuPopup>
        </Menu>
      ) : null}
    </div>
  );
});
