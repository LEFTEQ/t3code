/**
 * The tab strip's scroll position that brings the selected tab into view, or
 * the current one when it already is. A tab wider than the strip aligns to its
 * start, so asking again yields the same answer: the strip re-places after
 * every render, and alternating between the tab's start and end there would
 * never settle.
 */
export function scrollLeftToReveal(
  tab: { readonly start: number; readonly width: number },
  view: { readonly scrollLeft: number; readonly width: number },
): number {
  const end = tab.start + tab.width;
  if (tab.width >= view.width) return tab.start;
  if (tab.start < view.scrollLeft) return tab.start;
  if (end > view.scrollLeft + view.width) return end - view.width;
  return view.scrollLeft;
}
