import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ChildProcess } from "effect/unstable/process";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import type { ProviderExecutionSettings } from "./devboxExecution.ts";
import {
  DEFAULT_TIMEOUT_MS,
  isCommandMissingCause,
  parseGenericCliVersion,
  spawnAndCollect,
} from "./providerSnapshot.ts";
import { makeUnavailableUsageLimits } from "./providerUsageLimits.ts";

const RemoteStatus = Schema.fromJsonString(
  Schema.Struct({
    ready: Schema.Boolean,
    account: Schema.optional(Schema.String),
    message: Schema.optional(Schema.String),
  }),
);
const decodeRemoteStatus = Schema.decodeEffect(RemoteStatus);

class SwitcherooStatusError extends Schema.TaggedError<SwitcherooStatusError>()(
  "SwitcherooStatusError",
  {},
) {}

/** Read safe service metadata without a provider login or workspace admission. */
export const probeSwitcherooStatus = Effect.fn("probeSwitcherooStatus")(function* (
  provider: "claude" | "codex",
  settings: ProviderExecutionSettings & { readonly binaryPath?: string },
  checkedAt: string,
  environment?: NodeJS.ProcessEnv,
) {
  const binaryPath = settings.binaryPath || provider;
  // Version is local executable metadata only: no account login, lease, or workspace admission.
  const native = yield* Effect.gen(function* () {
    const command = yield* resolveSpawnCommand(binaryPath, ["--version"], {
      env: environment ?? process.env,
    });
    const result = yield* spawnAndCollect(
      binaryPath,
      ChildProcess.make(command.command, command.args, {
        env: environment ?? process.env,
        shell: command.shell,
      }),
    );
    return {
      installed: true,
      version: parseGenericCliVersion(`${result.stdout}\n${result.stderr}`),
      runnable: result.code === 0,
    };
  }).pipe(
    Effect.timeout(DEFAULT_TIMEOUT_MS),
    Effect.catch((cause) =>
      Effect.succeed({
        installed: !isCommandMissingCause(cause),
        version: null,
        runnable: false,
      }),
    ),
  );
  if (!native.runnable) {
    return {
      installed: native.installed,
      version: native.version,
      status: "error" as const,
      auth: { status: "unknown" as const, type: "switcheroo", label: "Switcheroo" },
      message: native.installed
        ? `The configured ${provider} CLI could not run its version check.`
        : `The configured ${provider} CLI was not found on the server. Check its binary path.`,
      usageLimits: makeUnavailableUsageLimits({ checkedAt, reason: "unsupported" }),
    };
  }
  const result = yield* spawnAndCollect(
    "switcheroo",
    ChildProcess.make(
      "switcheroo",
      [
        "remote",
        "status",
        "--provider",
        provider,
        ...(settings.switcherooAccount ? ["--account", settings.switcherooAccount] : []),
        "--json",
      ],
      { env: environment ?? process.env },
    ),
  ).pipe(
    Effect.flatMap((result) =>
      result.code === 0
        ? decodeRemoteStatus(result.stdout).pipe(
            Effect.mapError(() => new SwitcherooStatusError({})),
          )
        : Effect.fail(new SwitcherooStatusError({})),
    ),
    Effect.timeout(DEFAULT_TIMEOUT_MS),
    Effect.catch((cause) =>
      Effect.logWarning("Switcheroo readiness probe failed.", {
        errorTag: "_tag" in cause ? cause._tag : "Error",
      }).pipe(
        Effect.as({
          ready: false,
          message:
            "Cannot reach the remote Switcheroo service. Check its enrollment and service status.",
        }),
      ),
    ),
  );
  return {
    installed: native.installed,
    version: native.version,
    status: result.ready ? ("ready" as const) : ("error" as const),
    auth: {
      status: result.ready ? ("authenticated" as const) : ("unauthenticated" as const),
      type: "switcheroo",
      label:
        "account" in result && result.account ? `Switcheroo · ${result.account}` : "Switcheroo",
    },
    ...(!result.ready
      ? {
          message: result.message ?? "Enroll an eligible account in the remote Switcheroo service.",
        }
      : {}),
    usageLimits: makeUnavailableUsageLimits({ checkedAt, reason: "unsupported" }),
  };
});
