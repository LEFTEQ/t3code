import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  CircleAlertIcon,
  CircleDashedIcon,
  Columns2Icon,
  EyeIcon,
  GitBranchIcon,
  MessageSquareIcon,
  PlusIcon,
  Rows2Icon,
  SquarePenIcon,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { resolveRenameCommit } from "../components/chat/ChatHeader";
import {
  PROVIDER_ICON_BY_PROVIDER,
  getTriggerDisplayModelName,
} from "../components/chat/providerIconUtils";
import {
  prStatusIndicator,
  useLinkedThreadPullRequest,
} from "../components/ThreadStatusIndicators";
import { Button } from "../components/ui/button";
import { PanelTabCloseButton } from "../components/ui/panel-tab-close-button";
import { toastManager } from "../components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { isElectron } from "../env";
import { useOpenPrLink } from "../lib/openPullRequestLink";
import { cn } from "../lib/utils";
import { usePanelAnimationSettings } from "../panelAnimations";
import { useThreadShell } from "../state/entities";
import { environmentServerConfigsAtom } from "../state/server";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import type { SidebarThreadSummary } from "../types";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../workspaceTitlebar";
import { type TabAttention, useTabAttention } from "./attention";
import { type PaneLeaf, type PaneTab, paneTabKey } from "./paneTree";
import {
  type WorkspaceUiCommand,
  dispatchWorkspaceCommand,
  onWorkspaceUiCommand,
} from "./useWorkspaceShortcuts";
import { useWorkspaceStore } from "./workspaceStore";
import type { PaneChrome } from "./workspaceView";

const STATUS_LABEL: Record<TabAttention["status"], string | null> = {
  approval: "needs approval",
  input: "needs input",
  working: "working",
  monitoring: "monitoring",
  failed: "failed",
  ready: null,
};

// Static glyphs only: nine panes of looping spinners would repaint every frame.
// Hues follow the sidebar's system-wide status colors.
function TabStatusGlyph({
  tab,
  attention,
}: {
  readonly tab: PaneTab;
  readonly attention: TabAttention | null;
}) {
  if (tab.kind === "draft") return <SquarePenIcon aria-hidden className="size-3" />;
  switch (attention?.status) {
    case "working":
      return <CircleDashedIcon aria-hidden className="size-3 text-info-foreground" />;
    case "monitoring":
      return <EyeIcon aria-hidden className="size-3" />;
    case "approval":
      return <span aria-hidden className="size-1.5 rounded-full bg-warning" />;
    case "input":
      return <span aria-hidden className="size-1.5 rounded-full bg-primary" />;
    case "failed":
      return <CircleAlertIcon aria-hidden className="size-3 text-error-foreground" />;
    default:
      return <MessageSquareIcon aria-hidden className="size-3 opacity-70" />;
  }
}

function TabChip({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-4.5 shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 text-3xs text-muted-foreground [&_svg]:size-2.5 [&_svg]:shrink-0",
        className,
      )}
    >
      {children}
    </span>
  );
}

function useModelChip(shell: SidebarThreadSummary) {
  const configs = useAtomValue(environmentServerConfigsAtom);
  const instanceId = shell.session?.providerInstanceId ?? shell.modelSelection.instanceId;
  const provider = configs
    .get(shell.environmentId)
    ?.providers.find((candidate) => candidate.instanceId === instanceId);
  const model = provider?.models.find((candidate) => candidate.slug === shell.modelSelection.model);
  return {
    Icon: provider ? PROVIDER_ICON_BY_PROVIDER[provider.driver] : undefined,
    name: model ? getTriggerDisplayModelName(model) : shell.modelSelection.model,
  };
}

/** The thread header the selected tab carries: branch, linked PR and model. */
function SelectedTabChips({ shell }: { readonly shell: SidebarThreadSummary }) {
  const linked = useLinkedThreadPullRequest(
    shell.environmentId,
    shell.linkedPullRequest,
    true,
    shell.pullRequests,
    shell.branchPullRequest,
  );
  const pr = prStatusIndicator(linked?.pr ?? null, linked?.sourceControlProvider);
  const openPrLink = useOpenPrLink();
  const model = useModelChip(shell);
  return (
    <span className="flex shrink-0 items-center gap-1">
      {shell.branch ? (
        <TabChip>
          <GitBranchIcon aria-hidden />
          <span className="max-w-28 truncate font-mono text-3xs">{shell.branch}</span>
        </TabChip>
      ) : null}
      {pr && linked ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                onClick={(event) => openPrLink(event, pr.url)}
              />
            }
          >
            <TabChip>
              <pr.Icon aria-hidden className={pr.colorClass} />
              <span>#{linked.pr.number}</span>
            </TabChip>
          </TooltipTrigger>
          <TooltipPopup side="bottom">{pr.tooltip}</TooltipPopup>
        </Tooltip>
      ) : null}
      <TabChip>
        {model.Icon ? <model.Icon aria-hidden /> : null}
        <span className="max-w-32 truncate">{model.name}</span>
      </TabChip>
    </span>
  );
}

function TabRenameInput({
  title,
  onDone,
}: {
  readonly title: string;
  readonly onDone: (title: string | null) => void;
}) {
  const settledRef = useRef(false);
  const settle = (value: string | null) => {
    if (settledRef.current) return;
    settledRef.current = true;
    onDone(value);
  };
  return (
    <input
      autoFocus
      aria-label="Thread title"
      defaultValue={title}
      className="h-5 min-w-24 rounded-sm bg-transparent px-1 text-xs font-semibold text-foreground outline-none ring-1 ring-ring/60 focus:ring-ring"
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => settle(event.currentTarget.value)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation();
        if (event.key === "Enter") settle(event.currentTarget.value);
        if (event.key === "Escape") settle(null);
      }}
    />
  );
}

const PaneTabItem = memo(function PaneTabItem({
  tab,
  index,
  paneId,
  selected,
  paneFocused,
  renaming,
  onStartRename,
  onRenameDone,
}: {
  readonly tab: PaneTab;
  readonly index: number;
  readonly paneId: string;
  readonly selected: boolean;
  readonly paneFocused: boolean;
  readonly renaming: boolean;
  readonly onStartRename: (tab: PaneTab) => void;
  readonly onRenameDone: (tab: PaneTab, originalTitle: string, title: string | null) => void;
}) {
  const shell = useThreadShell(tab.kind === "server" ? tab.threadRef : null);
  const attention = useTabAttention(tab);
  const title = tab.kind === "draft" ? "New thread" : (shell?.title ?? "Thread");
  const statusLabel = attention ? STATUS_LABEL[attention.status] : null;
  const select = () => {
    const store = useWorkspaceStore.getState();
    store.focusPane(paneId);
    store.selectTab(index);
  };
  const close = () => useWorkspaceStore.getState().closeTab(paneId, index);
  return (
    <div
      data-tab-key={paneTabKey(tab)}
      data-selected={selected ? "true" : undefined}
      className={cn(
        "group/tab relative z-10 flex h-6 min-w-14 shrink items-center gap-1.5 rounded-md pr-1 pl-1.5 text-2xs",
        selected
          ? cn("shrink-0", paneFocused ? "text-foreground" : "text-foreground/80")
          : "max-w-36 text-muted-foreground hover:text-foreground",
      )}
      onAuxClick={(event) => {
        if (event.button === 1) close();
      }}
    >
      <span className="flex size-3 shrink-0 items-center justify-center">
        <TabStatusGlyph tab={tab} attention={attention} />
      </span>
      {renaming && shell ? (
        <TabRenameInput
          title={shell.title}
          onDone={(next) => onRenameDone(tab, shell.title, next)}
        />
      ) : (
        <button
          type="button"
          role="tab"
          aria-selected={selected}
          aria-label={statusLabel ? `${title}, ${statusLabel}` : title}
          className={cn(
            "min-w-0 cursor-pointer truncate text-left outline-none focus-visible:underline",
            selected && "max-w-40 font-semibold",
          )}
          onClick={select}
          onDoubleClick={() => {
            if (tab.kind === "server") onStartRename(tab);
          }}
        >
          {title}
        </button>
      )}
      {selected && shell ? <SelectedTabChips shell={shell} /> : null}
      <PanelTabCloseButton label={`Close ${title}`} onClick={close}>
        {attention?.unread && !selected ? (
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
        ) : null}
      </PanelTabCloseButton>
    </div>
  );
});

function useThreadRenamer() {
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  return useCallback(
    (tab: PaneTab, originalTitle: string, title: string) => {
      if (tab.kind !== "server") return;
      const resolution = resolveRenameCommit({ title, originalTitle });
      if (resolution.action === "reject-empty") {
        toastManager.add({ type: "warning", title: "Thread title cannot be empty" });
        return;
      }
      if (resolution.action === "noop") return;
      void updateThreadMetadata({
        environmentId: tab.threadRef.environmentId,
        input: { threadId: tab.threadRef.threadId, title: resolution.title },
      }).then((result) => {
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add({
            type: "error",
            title: "Failed to rename thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          });
        }
      });
    },
    [updateThreadMetadata],
  );
}

const PILL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function selectedTabElement(list: HTMLElement): HTMLElement | null {
  return list.querySelector<HTMLElement>('[data-tab-key][data-selected="true"]');
}

function placePill(list: HTMLElement, pill: HTMLElement, durationMs: number) {
  const tab = selectedTabElement(list);
  if (!tab) {
    pill.style.opacity = "0";
    return;
  }
  pill.style.transition =
    durationMs > 0
      ? `transform ${durationMs}ms ${PILL_EASE}, width ${durationMs}ms ${PILL_EASE}`
      : "none";
  pill.style.transform = `translateX(${tab.offsetLeft}px)`;
  pill.style.width = `${tab.offsetWidth}px`;
  pill.style.opacity = "1";
  if (tab.offsetLeft < list.scrollLeft) list.scrollLeft = tab.offsetLeft;
  else if (tab.offsetLeft + tab.offsetWidth > list.scrollLeft + list.clientWidth) {
    list.scrollLeft = tab.offsetLeft + tab.offsetWidth - list.clientWidth;
  }
}

/**
 * Slides the selected-tab pill between tabs (transitions.dev tabs-sliding) and
 * keeps the selected tab scrolled into view. It re-places after every render,
 * animating only when the selection moved; size changes (chips loading,
 * resizes) and the first placement never animate.
 */
function useSelectedTabPill() {
  const listRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const placedKeyRef = useRef<string | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const { active, durationMs } = usePanelAnimationSettings();

  const updateFade = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const left = list.scrollLeft > 1;
    const right = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setFade((current) =>
      current.left === left && current.right === right ? current : { left, right },
    );
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) return;
    const observer = new ResizeObserver(() => {
      placePill(list, pill, 0);
      updateFade();
    });
    observerRef.current = observer;
    observer.observe(list);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [updateFade]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) return;
    const tab = selectedTabElement(list);
    const key = tab?.dataset.tabKey ?? null;
    const moved = placedKeyRef.current !== null && placedKeyRef.current !== key;
    placePill(list, pill, moved && active ? durationMs : 0);
    placedKeyRef.current = key;
    if (tab) observerRef.current?.observe(tab);
    updateFade();
  });

  const maskImage =
    fade.left || fade.right
      ? `linear-gradient(to right, ${fade.left ? "transparent" : "black"}, black 16px, black calc(100% - 16px), ${fade.right ? "transparent" : "black"})`
      : undefined;
  return { listRef, pillRef, updateFade, style: { maskImage } as CSSProperties };
}

function StripAction({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * A pane's tabs plus its new-thread and split actions. The selected tab
 * carries the thread header (branch, PR, model); top-row strips double as the
 * window title bar, so they carry its drag region and corner insets.
 */
export function PaneTabStrip({
  pane,
  chrome,
  isFocused,
}: {
  readonly pane: PaneLeaf;
  readonly chrome: PaneChrome;
  readonly isFocused: boolean;
}) {
  const { listRef, pillRef, updateFade, style } = useSelectedTabPill();
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const renameThread = useThreadRenamer();

  const startRename = useCallback((tab: PaneTab) => setRenamingKey(paneTabKey(tab)), []);
  const finishRename = useCallback(
    (tab: PaneTab, originalTitle: string, title: string | null) => {
      setRenamingKey(null);
      if (title !== null) renameThread(tab, originalTitle, title);
    },
    [renameThread],
  );

  // ⌘R renames the focused pane's selected tab; drafts have no title to rename.
  const onUiCommand = useEffectEvent((command: WorkspaceUiCommand) => {
    const selected = pane.tabs[pane.selectedIndex];
    if (command === "tab.rename" && selected?.kind === "server") startRename(selected);
  });
  useEffect(() => {
    if (!isFocused) return;
    return onWorkspaceUiCommand((command) => onUiCommand(command));
  }, [isFocused]);

  const focusThen = (command: Parameters<typeof dispatchWorkspaceCommand>[0]) => {
    useWorkspaceStore.getState().focusPane(pane.id);
    dispatchWorkspaceCommand(command);
  };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 border-b border-border bg-background px-1.5",
        chrome.top
          ? "h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)]"
          : "h-9",
        chrome.top && isElectron && "drag-region",
        chrome.topLeft && COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        chrome.topRight && "pr-(--workspace-gutter-end) wco:pr-(--workspace-native-controls-inset)",
      )}
    >
      <div
        ref={listRef}
        role="tablist"
        aria-label="Pane tabs"
        className="relative flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={style}
        onScroll={updateFade}
      >
        <span
          ref={pillRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 left-0 -mt-3 h-6 rounded-md opacity-0",
            isFocused ? "bg-accent" : "bg-accent/60",
          )}
        />
        {pane.tabs.map((tab, index) => (
          <PaneTabItem
            key={paneTabKey(tab)}
            tab={tab}
            index={index}
            paneId={pane.id}
            selected={index === pane.selectedIndex}
            paneFocused={isFocused}
            renaming={renamingKey === paneTabKey(tab)}
            onStartRename={startRename}
            onRenameDone={finishRename}
          />
        ))}
      </div>
      <StripAction label="New thread" onClick={() => focusThen("tab.new")}>
        <PlusIcon />
      </StripAction>
      <StripAction label="Split right" onClick={() => focusThen("workspace.splitRight")}>
        <Columns2Icon />
      </StripAction>
      <StripAction label="Split down" onClick={() => focusThen("workspace.splitDown")}>
        <Rows2Icon />
      </StripAction>
      {/* The focused chat's panel controls sit fixed in the window's top-right corner. */}
      {chrome.topRight ? <span aria-hidden className="w-28 shrink-0" /> : null}
    </div>
  );
}
