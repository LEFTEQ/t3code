import { defineConfig } from './.vybava/config';

// Shared Výbava configuration for this repository — one section per applet.
// Evaluated with the helpers shipped by vybava, not a checked-in copy.
// `vybava config init` generates gitignored .vybava/config.ts editor types.
export default defineConfig({
  pr: {
    // prm / gitkit settings for the LEFTEQ fork (keys: ~/.claude/skills/prm/references/config.md).
    // Solo-owner fork: a PR is the trail, not a review. prm labels it eve-ignore and
    // admin-merges once clean and mergeable; no review rounds.
    merge: 'self',
    afterMerge: {
      // Keep a merged branch's Devbox app running for hand-testing; gc retires it later.
      devbox: 'reap',
    },
  },
  sync: {
    // Vite+ owns dependency installation (docs/operations/development.md).
    install: 'vp i',
    migrations: ['infra/relay/migrations'],
    // No repo-wide verify command: AGENTS.md requires checks scoped to the change.
  },
  guards: {
    // Generated app artifacts only; .repos/ references stay readable (AGENTS.md).
    noRead: [
      'apps/web/src/routeTree.gen.ts',
      'native/hyprland-snap-shot/Cargo.lock',
      'native/kde-snap-shot/Cargo.lock',
      'native/resource-monitor/Cargo.lock',
      'packages/effect-acp/src/_generated/meta.gen.ts',
      'packages/effect-acp/src/_generated/schema.gen.ts',
      'packages/effect-codex-app-server/src/_generated/meta.gen.ts',
      'packages/effect-codex-app-server/src/_generated/namespaces.gen.ts',
      'packages/effect-codex-app-server/src/_generated/schema.gen.ts',
    ],
  },
});
