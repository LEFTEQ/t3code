import { useRouter } from "@tanstack/react-router";
import { createContext, use, useMemo } from "react";

import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  resolveThreadRouteTarget,
  type ThreadRouteTarget,
} from "../threadRoutes";
import type { PaneId } from "./paneTree";

/**
 * The surface a chat lives in. Chat code opens, swaps and drops thread targets
 * through it instead of navigating the router, so the same ChatView works as
 * the routed single surface and as one pane of a split workspace.
 */
export interface PaneContextValue {
  readonly paneId: PaneId | null;
  /** Only the focused surface owns window-level keys, paste and composer focus. */
  readonly isFocused: boolean;
  /** The target this surface shows right now. */
  readonly readTarget: () => ThreadRouteTarget | null;
  /**
   * Changes whenever this surface moves to another target or goes away, so an
   * async flow can drop its result when the surface changed under it.
   */
  readonly readLocationKey: () => string;
  /** Shows a target: an existing one is focused, a new one opens in this surface. */
  readonly openTarget: (
    target: ThreadRouteTarget,
    options?: { readonly replace?: boolean },
  ) => void | Promise<void>;
  /** Swaps this surface's target in place, e.g. a draft promoted to its server thread. */
  readonly replaceTarget: (from: ThreadRouteTarget, to: ThreadRouteTarget) => void | Promise<void>;
  /** The target is gone (deleted thread, discarded draft); leave it. */
  readonly dismissTarget: (target: ThreadRouteTarget) => void | Promise<void>;
}

const PaneContext = createContext<PaneContextValue | null>(null);

export const PaneContextProvider = PaneContext.Provider;

type AppRouter = ReturnType<typeof useRouter>;

// No workspace host: the router is the one surface, exactly as before panes.
function createRouterPaneContext(router: AppRouter): PaneContextValue {
  const openTarget = async (
    target: ThreadRouteTarget,
    options?: { readonly replace?: boolean },
  ): Promise<void> => {
    const replace = options?.replace ?? false;
    if (target.kind === "server") {
      await router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(target.threadRef),
        replace,
      });
      return;
    }
    await router.navigate({
      to: "/draft/$draftId",
      params: buildDraftThreadRouteParams(target.draftId),
      replace,
    });
  };
  return {
    paneId: null,
    isFocused: true,
    readTarget: () =>
      resolveThreadRouteTarget(router.state.matches[router.state.matches.length - 1]?.params ?? {}),
    readLocationKey: () => router.state.location.href,
    openTarget,
    replaceTarget: (_from, to) => openTarget(to, { replace: true }),
    dismissTarget: async () => {
      await router.navigate({ to: "/", replace: true });
    },
  };
}

export function usePaneContext(): PaneContextValue {
  const provided = use(PaneContext);
  const router = useRouter();
  const routerPane = useMemo(() => createRouterPaneContext(router), [router]);
  return provided ?? routerPane;
}
