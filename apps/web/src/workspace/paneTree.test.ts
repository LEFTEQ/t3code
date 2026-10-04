import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { DraftId } from "../composerDraftStore";
import {
  createPaneLeaf,
  equalize,
  findTabLocation,
  listPanes,
  moveTab,
  neighbourPane,
  paneRects,
  removeTab,
  reorderTab,
  resizePane,
  setSplitRatio,
  splitPane,
  type PaneNode,
  type PaneTab,
} from "./paneTree";

const thread = (id: string): PaneTab => ({
  kind: "server",
  threadRef: scopeThreadRef("env-1" as EnvironmentId, ThreadId.make(id)),
});
const draft = (id: string): PaneTab => ({ kind: "draft", draftId: id as DraftId });

/** a | (b / c): a on the left, b over c on the right. */
function threePanes(rightRatio = 0.5): PaneNode {
  const right = splitPane(
    createPaneLeaf("b", [thread("B")]),
    "b",
    "down",
    { splitId: "s2", paneId: "c" },
    thread("C"),
  );
  const withRatio = right.kind === "split" ? { ...right, ratio: rightRatio } : right;
  return {
    kind: "split",
    id: "s1",
    direction: "row",
    ratio: 0.5,
    first: createPaneLeaf("a", [thread("A")]),
    second: withRatio,
  };
}

describe("paneTree", () => {
  it("splits a pane into a half-and-half split holding the given tab", () => {
    const root = splitPane(
      createPaneLeaf("a", [thread("A")]),
      "a",
      "right",
      { splitId: "s", paneId: "b" },
      draft("d"),
    );
    expect(root).toMatchObject({ kind: "split", direction: "row", ratio: 0.5 });
    expect(listPanes(root).map((pane) => [pane.id, pane.tabs])).toEqual([
      ["a", [thread("A")]],
      ["b", [draft("d")]],
    ]);
  });

  it("collapses a pane whose last tab closes, but keeps the only pane even when empty", () => {
    const { root, removed, collapsedInto } = removeTab(threePanes(), "c", 0);
    expect(removed).toEqual(thread("C"));
    expect(collapsedInto).toBe("b");
    expect(listPanes(root).map((pane) => pane.id)).toEqual(["a", "b"]);

    const only = removeTab(createPaneLeaf("a", [thread("A")]), "a", 0);
    expect(only.collapsedInto).toBeNull();
    expect(only.root).toMatchObject({ kind: "pane", id: "a", tabs: [] });
  });

  it("finds a tab by thread identity, not object identity", () => {
    expect(findTabLocation(threePanes(), thread("C"))).toEqual({ paneId: "c", index: 0 });
    expect(findTabLocation(threePanes(), draft("missing"))).toBeNull();
  });

  it("moves focus to the spatial neighbour and stops at the outer edge", () => {
    const root = threePanes();
    expect(neighbourPane(root, "b", "down")).toBe("c");
    expect(neighbourPane(root, "c", "left")).toBe("a");
    expect(neighbourPane(root, "a", "left")).toBeNull();
    expect(neighbourPane(root, "b", "up")).toBeNull();
  });

  it("prefers the neighbour sharing the longest edge", () => {
    // b takes 30% of the right column, so c shares more of a's right edge.
    expect(neighbourPane(threePanes(0.3), "a", "right")).toBe("c");
    expect(paneRects(threePanes(0.3)).get("b")).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.3 });
  });

  it("moves a tab into another pane and collapses the emptied source", () => {
    const root = moveTab(threePanes(), "c", 0, "a");
    expect(listPanes(root).map((pane) => [pane.id, pane.tabs.length, pane.selectedIndex])).toEqual([
      ["a", 2, 1],
      ["b", 1, 0],
    ]);
  });

  it("reorders the selected tab and leaves it selected", () => {
    const pane = {
      ...createPaneLeaf("a", [thread("A"), thread("B"), thread("C")]),
      selectedIndex: 1,
    };
    const moved = reorderTab(pane, "a", 1);
    expect(moved).toMatchObject({
      tabs: [thread("A"), thread("C"), thread("B")],
      selectedIndex: 2,
    });
    expect(reorderTab(moved, "a", 1)).toBe(moved);
  });

  it("equalizes every split", () => {
    const root = equalize(setSplitRatio(threePanes(0.2), "s1", 0.8));
    expect(paneRects(root).get("c")).toEqual({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
  });

  it("resizes by pixel steps without shrinking a pane below its minimum", () => {
    const container = { width: 1000, height: 800 };
    const grown = resizePane(threePanes(), "a", "right", 100, container);
    expect(grown.kind === "split" ? grown.ratio : null).toBeCloseTo(0.6);
    // The right column cannot go below 240px.
    const clamped = resizePane(threePanes(), "a", "right", 700, container);
    expect(clamped.kind === "split" ? clamped.ratio : null).toBeCloseTo(0.76);
    // a has no divider on its left.
    expect(resizePane(threePanes(), "a", "left", 100, container)).toEqual(threePanes());
  });
});
