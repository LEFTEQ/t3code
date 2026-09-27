// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { describe, expect, it } from "vite-plus/test";

import {
  devboxAgentCommand,
  providerExecutionCommand,
  spawnClaudeInDevbox,
} from "./devboxExecution.ts";

describe("Devbox provider execution", () => {
  it("selects the account inside Devbox admission and keeps account names literal", () => {
    const input = {
      provider: "codex" as const,
      command: "/tools/codex",
      args: ["app-server"],
      cwd: "/workspace",
      settings: { accountSource: "switcheroo" as const, switcherooAccount: "work ; $(echo nope)" },
    };
    const host = providerExecutionCommand(input);
    expect(host).toEqual({
      command: "switcheroo",
      args: [
        "remote",
        "exec",
        "--provider",
        "codex",
        "--account",
        "work ; $(echo nope)",
        "--",
        "/tools/codex",
        "app-server",
      ],
    });
    expect(
      providerExecutionCommand({
        ...input,
        settings: { ...input.settings, executionTarget: "devbox" },
      }),
    ).toEqual({
      command: "devbox",
      args: ["ws", "agent-exec", "--cwd", "/workspace", "--", host.command, ...host.args],
    });
  });
  it("rejects a relative project path instead of admitting work in the wrong checkout", () => {
    expect(() =>
      devboxAgentCommand({ command: "codex", args: ["app-server"], cwd: "project" }),
    ).toThrow("absolute project directory");
  });

  it.skipIf(HostProcessPlatform.defaultValue() === "win32")(
    "preserves the native SDK protocol and literal argv through the admission process",
    async () => {
      const directory = await NodeFSP.realpath(
        await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-devbox-exec-")),
      );
      try {
        await NodeFSP.writeFile(
          NodePath.join(directory, "devbox"),
          `#!${process.execPath}
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ args: process.argv.slice(2), input, cwd: process.cwd() }));
});
`,
          { mode: 0o700 },
        );
        const args = ["--input-format", "stream-json", "literal $(exit 99); 'quoted' value"];
        const child = spawnClaudeInDevbox({
          command: "/tools/claude with spaces",
          args,
          cwd: directory,
          env: {
            ...process.env,
            PATH: `${directory}${NodePath.delimiter}${process.env.PATH ?? ""}`,
          },
          signal: new AbortController().signal,
        });
        let output = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          output += chunk;
        });
        const ended = new Promise<void>((resolve, reject) => {
          child.stdout.once("end", resolve);
          child.stdout.once("error", reject);
        });
        const exited = new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("exit", resolve);
        });
        const request = '{"type":"user","message":"hello"}\n';
        child.stdin.end(request);
        const [exitCode] = await Promise.all([exited, ended]);
        expect(exitCode).toBe(0);
        expect(JSON.parse(output)).toEqual({
          args: [
            "ws",
            "agent-exec",
            "--cwd",
            directory,
            "--",
            "/tools/claude with spaces",
            ...args,
          ],
          input: request,
          cwd: directory,
        });
      } finally {
        await NodeFSP.rm(directory, { recursive: true, force: true });
      }
    },
  );
});
