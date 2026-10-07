import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { DraftId } from "../composerDraftStore";
import { shouldUseRightPanelSheetForRowWidth } from "../rightPanelLayout";
import { createPaneLeaf, splitPane, type PaneTab } from "./paneTree";
import { paneServerThreadKeys } from "./workspaceInspectorContext";

const threadRef = (id: string) => scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(id));
const thread = (id: string): PaneTab => ({ kind: "server", threadRef: threadRef(id) });
const draft = (id: string): PaneTab => ({ kind: "draft", draftId: id as DraftId });

describe("paneServerThreadKeys", () => {
  const root = splitPane(
    createPaneLeaf("a", [thread("A1"), draft("d1"), thread("A2")]),
    "a",
    "right",
    { splitId: "s1", paneId: "b" },
    thread("B1"),
  );

  it("lists only that pane's server tabs, so terminals stay with their pane", () => {
    expect(paneServerThreadKeys(root, "a")).toEqual([
      scopedThreadKey(threadRef("A1")),
      scopedThreadKey(threadRef("A2")),
    ]);
    expect(paneServerThreadKeys(root, "b")).toEqual([scopedThreadKey(threadRef("B1"))]);
  });

  it("is empty for a pane that no longer exists", () => {
    expect(paneServerThreadKeys(root, "gone")).toEqual([]);
  });
});

describe("shouldUseRightPanelSheetForRowWidth", () => {
  it("keeps the inspector inline only when it fits beside a usable pane", () => {
    expect(shouldUseRightPanelSheetForRowWidth(719)).toBe(true);
    expect(shouldUseRightPanelSheetForRowWidth(720)).toBe(false);
  });
});
