// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import type { Options as ClaudeQueryOptions } from "@anthropic-ai/claude-agent-sdk";

/** The guest resolves source ownership and admits the process before executing it. */
export function devboxAgentCommand(input: {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
}) {
  if (!NodePath.isAbsolute(input.cwd)) {
    throw new Error("Devbox agent execution requires an absolute project directory on the server.");
  }
  return {
    command: "devbox",
    args: ["ws", "agent-exec", "--cwd", input.cwd, "--", input.command, ...input.args],
  };
}

export interface ProviderExecutionSettings {
  readonly executionTarget?: "host" | "devbox";
  readonly accountSource?: "provider" | "switcheroo";
  readonly switcherooAccount?: string;
}

/** Admission owns the whole session, including account selection and the native provider. */
export function providerExecutionCommand(input: {
  readonly provider: "claude" | "codex";
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly settings: ProviderExecutionSettings;
}) {
  const command =
    input.settings.accountSource === "switcheroo"
      ? {
          command: "switcheroo",
          args: [
            "remote",
            "exec",
            "--provider",
            input.provider,
            ...(input.settings.switcherooAccount
              ? ["--account", input.settings.switcherooAccount]
              : []),
            "--",
            input.command,
            ...input.args,
          ],
        }
      : { command: input.command, args: [...input.args] };
  return input.settings.executionTarget === "devbox"
    ? devboxAgentCommand({ ...command, cwd: input.cwd })
    : command;
}

/** Preserve the SDK's protocol streams and graceful-cancellation signal. */
export const createClaudeProcessSpawner =
  (
    settings: ProviderExecutionSettings,
  ): NonNullable<ClaudeQueryOptions["spawnClaudeCodeProcess"]> =>
  (options) => {
    const command = providerExecutionCommand({
      provider: "claude",
      settings,
      command: options.command,
      args: options.args,
      cwd: options.cwd ?? process.cwd(),
    });
    return NodeChildProcess.spawn(command.command, command.args, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      stdio: ["pipe", "pipe", "inherit"],
    });
  };

export const spawnClaudeInDevbox = createClaudeProcessSpawner({ executionTarget: "devbox" });
