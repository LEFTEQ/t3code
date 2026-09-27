import type { ProviderExecutionSettings } from "./devboxExecution.ts";

/** Preserve existing host identities, but isolate continuations across execution/account settings. */
export function providerExecutionIdentity(
  key: string,
  settings: ProviderExecutionSettings,
): string {
  if (settings.accountSource !== "switcheroo" && settings.executionTarget !== "devbox") return key;
  return `${key}:execution:${JSON.stringify([
    settings.executionTarget ?? "host",
    settings.accountSource ?? "provider",
    settings.accountSource === "switcheroo" ? (settings.switcherooAccount ?? null) : null,
  ])}`;
}
