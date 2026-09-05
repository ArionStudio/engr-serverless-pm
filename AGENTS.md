# AGENTS.md - Agent Rulebook

> Last updated: 2026-06-13

## Project

Chrome extension password manager (engineering thesis on WebCrypto API).
Hexagonal architecture. Serverless. All logic client-side, cloud only for encrypted sync.

## Tech Stack

| Component       | Technology                        |
| --------------- | --------------------------------- |
| Extension       | Chrome Manifest V3                |
| Frontend        | React 19, TypeScript 5.9 (strict) |
| Build           | Vite 7 + SWC                      |
| UI              | Base UI React, Tailwind CSS 4     |
| Icons           | Hugeicons                         |
| State           | Zustand (planned)                 |
| Local Storage   | IndexedDB via Dexie.js            |
| Crypto          | WebCrypto API                     |
| Cloud Sync      | AWS S3 with user-provided keys    |
| Testing         | Vitest                            |
| Package Manager | pnpm                              |

## Essential Commands

```bash
pnpm ext:dev      # Dev mode (already running in background - don't start)
pnpm ext:build    # Build
pnpm ext:lint     # Lint
pnpm ext:test     # Test
pnpm core:test     # Core package tests
pnpm core:type-check # Core package type-check
```

Run project commands from repo root unless a task explicitly requires a subdirectory.

---

## The "Never" List

- **NEVER** use `any` type
- **NEVER** install dependencies without asking
- **NEVER** use default exports (except entry points)
- **NEVER** use `console.log` in production
- **NEVER** use `npm` or `yarn` - pnpm only
- **NEVER** use `react-icons` - use `@hugeicons/react` with `@hugeicons/core-free-icons`
- **NEVER** use Radix UI - we use Base UI now

---

## Active Gotchas

<!-- Add mistakes here as they occur -->

- **No subtitles:** The user forbids product heading subtitles, eyebrow slogans,
  marketing taglines and decorative footer copy. Use direct task titles and
  controls. Keep necessary field guidance, errors and safety information at the
  relevant action; avoid repeating it. Gallery usage explanations remain required.

- **Chrome build filenames:** Generated chunks must not start with `_`; Chrome
  rejects the unpacked extension. Keep the chunk prefix and output filename check,
  and validate packaging changes by actually loading the unpacked build in Chrome.
- **Extension module preloads:** Keep `build.modulePreload: false` in the extension
  Vite config. Chrome extension origins reject the generated preload requests as
  cross-world mismatches. Browser validation must collect console and CDP Log
  warnings as well as page errors, including delayed unused-preload warnings.

- **Vault lock durations:** Use the core `AVAILABLE_VAULT_LOCK_DELAYS_MS` values in milliseconds for UI drafts and gallery examples. Reuse `ui/lib/vault-lock-options.ts` for labels; do not duplicate choices in minutes or seconds.
- **Empty password strength:** Hide the entire strength block while the password is empty. Do not add placeholder copy or reserve an empty gap. Show feedback after typing; hide it again when cleared.

- **Field guidance:** State what is required and the field’s purpose. Do not narrate internal checks or UI behavior. Additional explanations are for security concerns, safe data handling, and why a security requirement matters.

- **Product copy:** Do not label the UI as synthetic, sample, temporary, demonstration, or preview. Keep implementation status in developer docs. Controls must describe their actual action, and must not claim that an unsaved vault was created. Preserve the two large cards on the setup start screen.

- **Living component gallery:** Every added or changed rendered UI component must
  update the gallery in the same change. Register actual implementations and
  expose labeled choosers for all supported named variants, sizes and layouts,
  with behavior states separately reviewable. List compound parts under their
  family instead of leaving them untracked. See `docs/standards/react-and-ui.md`
  UI-006; keep examples synthetic and excluded from the production extension.

- **Pre-release data model**: Until the first public release exists, correct the
  current data model in place. Do not add legacy compatibility branches,
  migration layers, parallel schema versions, or new version identifiers unless
  the user explicitly approves them.
- **Type imports**: Use `import type { X }` for type-only imports (verbatimModuleSyntax)
- **Base UI migration**: Some shadcn remnants exist. Use Base UI patterns for new code.
- **Checkbox/radio labels**: Default Base UI controls render non-native roots.
  Wrap them in a label with an explicit `aria-labelledby` association; do not
  assume sibling `htmlFor`/`id` labels name or activate them. Verify the accessible
  name and label-click behavior in tests.
- **Resizable gallery layout**: Panel groups set inline `height: 100%`. Place
  them inside a host with a definite height and let pane content scroll. A
  minimum height inside an auto-sized grid row can overlap the next specimen;
  check vertical bounds after resizing, not just document overflow.
- **Theme context**: Components using `useTheme()` need `ThemeProvider` wrapper.
- **CVA + cn()**: Always merge CVA variants with `cn()` utility.
- **No `delete` operator**: Do not use JavaScript `delete` anywhere in code.
- **Domain type and policy separation**: Keep stable public domain types in
  `.type.ts` modules. Keep context-specific pure policy operations in separate
  internal modules, and do not use policy validation to assert a broader raw
  input brand or export internal policy helpers through domain barrels.
- **Device enrollment expiry**: Do not model enrollment expiry in core device-trust state; without a trusted time authority, local `expiresAt` checks are not security boundaries.
- **Initialization result**: `InitializeVaultUseCase` returns recovery words and
  the display name. Read the new vault ID through `GetVaultSessionStatusUseCase`
  after activation; do not assume initialization returns `vaultId`.

---

## Architecture (Hexagonal)

```
┌─────────────────────────────────────┐
│           UI Layer                  │  React, Zustand, Base UI
│  (apps/extension/src/ui/,           │
│   apps/extension/src/extension/)    │
├─────────────────────────────────────┤
│        Adapters Layer               │  WebCrypto, Dexie.js, AWS SDK
│  (apps/extension/src/adapters/)     │
├─────────────────────────────────────┤
│          Core Layer                 │  packages/core/src
│  (packages/core/src/)               │
└─────────────────────────────────────┘
```

Dependencies point inward: adapters implement and depend on core ports;
composition roots depend on core and adapters; UI and runtime initiators call
composed use cases. Core never imports extension layers.

Normative core architecture decisions live in
`docs/standards/core-architecture.md`; the implemented structure is described
in `docs/core/architecture.md`.

---

## Revert & Update Workflow

When agent makes a mistake:

1. Revert the bad code
2. Add gotcha to this file
3. Restart with adjusted prompt

---

## Continuous Improvements

If the agent discovers recurring repo-specific issues, useful workflows, or conventions that would speed up future work, it may append concise notes/rules to this file.
