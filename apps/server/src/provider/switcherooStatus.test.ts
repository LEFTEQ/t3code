import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";
import { ProviderCommandNotFoundError, spawnAndCollect } from "./providerSnapshot.ts";
import { probeSwitcherooStatus } from "./switcherooStatus.ts";

vi.mock("./providerSnapshot.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./providerSnapshot.ts")>()),
  spawnAndCollect: vi.fn(),
}));

it.effect("reports a missing native executable before consulting remote account readiness", () =>
  Effect.gen(function* () {
    vi.mocked(spawnAndCollect)
      .mockReset()
      .mockReturnValueOnce(
        Effect.fail(
          new ProviderCommandNotFoundError({
            binaryPath: "/missing/codex",
            exitCode: 127,
            stdoutLength: 0,
            stderrLength: 0,
          }),
        ),
      );
    const result = yield* probeSwitcherooStatus(
      "codex",
      {
        accountSource: "switcheroo",
        binaryPath: "/missing/codex",
      },
      "2026-09-27T00:00:00.000Z",
    );
    assert.strictEqual(result.installed, false);
    assert.strictEqual(result.status, "error");
    assert.strictEqual(result.auth.status, "unknown");
    assert.strictEqual(vi.mocked(spawnAndCollect).mock.calls.length, 1);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("reports readiness from the enrolled remote account with unsupported usage", () =>
  Effect.gen(function* () {
    vi.mocked(spawnAndCollect)
      .mockReset()
      .mockReturnValueOnce(
        Effect.succeed({
          code: 0,
          stdout: "codex-cli 1.2.3",
          stderr: "",
        }),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          code: 0,
          stdout: '{"ready":true,"account":"work"}',
          stderr: "",
        }),
      );
    const result = yield* probeSwitcherooStatus(
      "codex",
      {
        executionTarget: "devbox",
        accountSource: "switcheroo",
        switcherooAccount: "work",
      },
      "2026-09-27T00:00:00.000Z",
    );
    assert.strictEqual(result.status, "ready");
    assert.strictEqual(result.version, "1.2.3");
    assert.strictEqual(result.installed, true);
    assert.deepStrictEqual(result.auth, {
      status: "authenticated",
      type: "switcheroo",
      label: "Switcheroo · work",
    });
    assert.strictEqual(result.usageLimits.unavailable?.reason, "unsupported");
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("keeps an unavailable remote account unauthenticated", () =>
  Effect.gen(function* () {
    vi.mocked(spawnAndCollect)
      .mockReset()
      .mockReturnValueOnce(
        Effect.succeed({
          code: 0,
          stdout: "codex-cli 1.2.3",
          stderr: "",
        }),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          code: 0,
          stdout: '{"ready":false,"message":"Account requires enrollment."}',
          stderr: "",
        }),
      );
    const result = yield* probeSwitcherooStatus(
      "claude",
      { accountSource: "switcheroo" },
      "2026-09-27T00:00:00.000Z",
    );
    assert.strictEqual(result.auth.status, "unauthenticated");
    assert.strictEqual(result.message, "Account requires enrollment.");
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("fails closed when service status is malformed", () =>
  Effect.gen(function* () {
    vi.mocked(spawnAndCollect)
      .mockReset()
      .mockReturnValueOnce(
        Effect.succeed({
          code: 0,
          stdout: "codex-cli 1.2.3",
          stderr: "",
        }),
      )
      .mockReturnValueOnce(
        Effect.succeed({
          code: 0,
          stdout: "{}",
          stderr: "",
        }),
      );
    const result = yield* probeSwitcherooStatus(
      "codex",
      { accountSource: "switcheroo" },
      "2026-09-27T00:00:00.000Z",
    );
    assert.strictEqual(result.status, "error");
    assert.strictEqual(result.auth.status, "unauthenticated");
  }).pipe(Effect.provide(NodeServices.layer)),
);
