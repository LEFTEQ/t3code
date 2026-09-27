import { assert, it } from "@effect/vitest";
import { providerExecutionIdentity } from "./providerExecutionIdentity.ts";

it("preserves existing host continuations and separates account and admission changes", () => {
  const key = "codex:home:/home/t3/.codex";
  assert.strictEqual(providerExecutionIdentity(key, {}), key);
  assert.strictEqual(
    providerExecutionIdentity(key, { accountSource: "provider", executionTarget: "host" }),
    key,
  );
  const variants = [
    {},
    { executionTarget: "devbox" },
    { accountSource: "switcheroo" },
    { accountSource: "switcheroo", switcherooAccount: "work" },
    { accountSource: "switcheroo", switcherooAccount: "personal" },
    { accountSource: "switcheroo", switcherooAccount: "work", executionTarget: "devbox" },
  ] as const;
  assert.strictEqual(
    new Set(variants.map((settings) => providerExecutionIdentity(key, settings))).size,
    variants.length,
  );
});
