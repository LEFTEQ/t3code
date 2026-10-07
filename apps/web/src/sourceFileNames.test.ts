import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";

// macOS and Windows disks are case-insensitive. Two modules whose paths differ only
// by letter case or extension (workspaceInspector.ts beside WorkspaceInspector.tsx)
// make an extensionless import resolve to the wrong file there, breaking the desktop
// build on a Mac while Linux CI resolves it fine.
describe("web source file names", () => {
  it("never differ only by letter case or extension", () => {
    const modulesByKey = new Map<string, string[]>();
    for (const path of NodeFS.readdirSync(import.meta.dirname, { recursive: true })) {
      if (typeof path !== "string" || !/\.tsx?$/.test(path) || /\.(test|d)\.tsx?$/.test(path)) {
        continue;
      }
      const key = path.replace(/\.tsx?$/, "").toLowerCase();
      modulesByKey.set(key, [...(modulesByKey.get(key) ?? []), path]);
    }
    const collisions = [...modulesByKey.values()].filter((paths) => paths.length > 1);
    expect(collisions).toEqual([]);
  });
});
