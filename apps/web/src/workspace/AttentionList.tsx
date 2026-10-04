import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { type KeyboardEvent, useEffect, useEffectEvent, useMemo, useState } from "react";

import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
} from "../components/ui/command";
import { useThreadShells } from "../state/entities";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { useUiStateStore } from "../uiStateStore";
import { type WaitingTab, latestWaitingTab, shellMapFor, waitingTabs } from "./attention";
import { type WorkspaceUiCommand, onWorkspaceUiCommand } from "./useWorkspaceShortcuts";
import { selectFocusedTab, useWorkspaceStore } from "./workspaceStore";

const STATE_LABEL: Record<WaitingTab["attention"]["status"], string> = {
  approval: "Needs approval",
  input: "Needs input",
  failed: "Failed",
  ready: "Done",
  working: "Working",
  monitoring: "Monitoring",
};

const STATE_TONE: Partial<Record<WaitingTab["attention"]["status"], string>> = {
  approval: "text-warning-foreground",
  input: "text-primary",
  failed: "text-error-foreground",
  ready: "text-success-foreground",
};

const entryKey = (entry: WaitingTab) => scopedThreadKey(entry.tab.threadRef);

function jumpTo(entry: WaitingTab) {
  useWorkspaceStore.getState().openTarget(entry.tab);
}

/**
 * ⌘I: the agents waiting on the user across every workspace; Enter jumps.
 * Also answers ⌘⇧U by focusing the newest waiting tab. Mounted once, by the
 * focused pane.
 */
export function AttentionList() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const shells = useThreadShells();
  const lastVisitedAtByKey = useUiStateStore((state) => state.threadLastVisitedAtById);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const shellByKey = shellMapFor(shells);
  const waiting = useMemo(
    () => waitingTabs(workspaces, shellByKey, lastVisitedAtByKey),
    [workspaces, shellByKey, lastVisitedAtByKey],
  );
  const onUiCommand = useEffectEvent((command: WorkspaceUiCommand) => {
    if (command === "attention.list") {
      setQuery("");
      setOpen((current) => !current);
    }
    if (command === "attention.jumpLatest") {
      const target = latestWaitingTab(waiting, selectFocusedTab(useWorkspaceStore.getState()));
      if (target) jumpTo(target);
    }
  });
  useEffect(() => onWorkspaceUiCommand((command) => onUiCommand(command)), []);

  const titleOf = (entry: WaitingTab) => shellByKey.get(entryKey(entry))?.title ?? "Thread";
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? waiting.filter((entry) =>
        `${titleOf(entry)} ${entry.workspaceName}`.toLowerCase().includes(needle),
      )
    : waiting;

  const choose = (entry: WaitingTab | undefined) => {
    if (!entry) return;
    setOpen(false);
    jumpTo(entry);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup aria-label="Waiting agents" className="overflow-hidden">
        <Command
          aria-label="Waiting agents"
          mode="none"
          value={query}
          onValueChange={setQuery}
          onItemHighlighted={(value) => setHighlighted(typeof value === "string" ? value : null)}
        >
          <CommandInput
            placeholder="Jump to a waiting agent…"
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              choose(visible.find((entry) => entryKey(entry) === highlighted) ?? visible[0]);
            }}
          />
          <CommandPanel className="max-h-[min(24rem,60vh)]">
            {visible.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {waiting.length === 0 ? "Nothing is waiting on you." : "No matching agents."}
              </div>
            ) : (
              <CommandList>
                <CommandGroup items={visible}>
                  <CommandCollection>
                    {(entry: WaitingTab) => (
                      <CommandItem
                        key={entryKey(entry)}
                        value={entryKey(entry)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(entry)}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm text-foreground">{titleOf(entry)}</span>
                          <span className="truncate text-xs text-muted-foreground/70">
                            {entry.workspaceName} · pane {entry.paneNumber}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 text-xs font-medium ${STATE_TONE[entry.attention.status] ?? ""}`}
                        >
                          {STATE_LABEL[entry.attention.status]}
                        </span>
                        {entry.attention.since !== null ? (
                          <span className="min-w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground/70">
                            {formatRelativeTimeLabel(new Date(entry.attention.since).toISOString())}
                          </span>
                        ) : null}
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              </CommandList>
            )}
          </CommandPanel>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
