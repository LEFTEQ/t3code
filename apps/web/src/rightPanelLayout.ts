export const RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 980px)";

/**
 * Narrowest workspace row that fits the inline inspector's minimum (360 px)
 * beside a usable pane (360 px). Inside the workspace this row width, not the
 * viewport, decides between the inline inspector and the sheet.
 */
export const RIGHT_PANEL_INLINE_MIN_ROW_WIDTH_PX = 720;

export function shouldUseRightPanelSheetForRowWidth(rowWidth: number): boolean {
  return rowWidth < RIGHT_PANEL_INLINE_MIN_ROW_WIDTH_PX;
}
