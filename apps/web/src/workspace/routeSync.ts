/**
 * Keeps the URL and the workspace's focused tab pointing at the same thread.
 *
 * Either side can move first: the router (sidebar, palette, deep links, back)
 * or the workspace (pane focus, tab switches, closes). Comparing both against
 * what was last reconciled tells which one moved, so the follower catches up
 * once and the next pass finds them equal — no loop.
 */
import { paneTabKey, type PaneTab } from "./paneTree";

export interface RouteSyncState {
  readonly routeKey: string | null;
  readonly focusedKey: string | null;
}

export type RouteSyncAction =
  | { readonly kind: "none" }
  /** The router moved: show its target in the workspace. */
  | { readonly kind: "open"; readonly target: PaneTab }
  /** The workspace moved: the URL follows with `replace`; null is the index route. */
  | { readonly kind: "navigate"; readonly target: PaneTab | null };

function tabKey(tab: PaneTab | null): string | null {
  return tab ? paneTabKey(tab) : null;
}

/**
 * Decides who follows whom. A router move wins when both moved, since it is
 * an explicit navigation; the index route (no target) never opens anything.
 */
export function planRouteSync(
  previous: RouteSyncState | null,
  routeTarget: PaneTab | null,
  focusedTab: PaneTab | null,
): { readonly action: RouteSyncAction; readonly next: RouteSyncState } {
  const next = { routeKey: tabKey(routeTarget), focusedKey: tabKey(focusedTab) };
  if (next.routeKey === next.focusedKey) return { action: { kind: "none" }, next };
  const routeMoved = previous === null || previous.routeKey !== next.routeKey;
  if (routeMoved && routeTarget) return { action: { kind: "open", target: routeTarget }, next };
  return { action: { kind: "navigate", target: focusedTab }, next };
}
