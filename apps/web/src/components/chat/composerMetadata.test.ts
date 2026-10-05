import { describe, expect, it } from "vite-plus/test";

import { type ComposerMetadataInput, resolveComposerMetadataSegments } from "./composerMetadata";

const defaults: ComposerMetadataInput = {
  inPane: true,
  interactionMode: "default",
  runtimeMode: "full-access",
  defaultRuntimeMode: "full-access",
  effortChanged: false,
  otherHost: false,
  worktree: false,
  hasBranch: true,
  stashed: false,
};

describe("resolveComposerMetadataSegments", () => {
  it("shows only the project and the menu when everything is the configured default", () => {
    expect(resolveComposerMetadataSegments(defaults)).toEqual(["project", "more"]);
  });

  it.each([
    [{ interactionMode: "plan" }, "plan"],
    [{ runtimeMode: "approval-required" }, "access"],
    [{ effortChanged: true }, "effort"],
    [{ otherHost: true }, "host"],
    [{ worktree: true }, "worktree"],
    [{ stashed: true }, "stash"],
  ] as const)("adds exactly one segment for %o", (change, segment) => {
    expect(resolveComposerMetadataSegments({ ...defaults, ...change })).toEqual([
      "project",
      segment,
      "more",
    ]);
  });

  it("never names full access when it is the project's default", () => {
    expect(resolveComposerMetadataSegments(defaults)).not.toContain("access");
    expect(
      resolveComposerMetadataSegments({ ...defaults, defaultRuntimeMode: "approval-required" }),
    ).toContain("access");
  });

  it("shows model and branch outside a pane, where no tab chip carries them", () => {
    expect(resolveComposerMetadataSegments({ ...defaults, inPane: false })).toEqual([
      "project",
      "model",
      "branch",
      "more",
    ]);
    expect(
      resolveComposerMetadataSegments({ ...defaults, inPane: false, hasBranch: false }),
    ).toEqual(["project", "model", "more"]);
  });
});
