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
| Icons           | Phosphor Icons                    |
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
- **NEVER** use `react-icons` - use `@phosphor-icons/react`
- **NEVER** use Radix UI - we use Base UI now

---

## Active Gotchas

<!-- Add mistakes here as they occur -->

- **Type imports**: Use `import type { X }` for type-only imports (verbatimModuleSyntax)
- **Base UI migration**: Some shadcn remnants exist. Use Base UI patterns for new code.
- **Theme context**: Components using `useTheme()` need `ThemeProvider` wrapper.
- **CVA + cn()**: Always merge CVA variants with `cn()` utility.
- **No `delete` operator**: Do not use JavaScript `delete` anywhere in code.
- **Device enrollment expiry**: Do not model enrollment expiry in core device-trust state; without a trusted time authority, local `expiresAt` checks are not security boundaries.

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

**Import direction**: `core` → `adapters` → `ui`

Follow this project import direction. Core-specific architecture decisions live
in `docs/development/core-architecture.md`.

---

## Revert & Update Workflow

When agent makes a mistake:

1. Revert the bad code
2. Add gotcha to this file
3. Restart with adjusted prompt

---

## Continuous Improvements

If the agent discovers recurring repo-specific issues, useful workflows, or conventions that would speed up future work, it may append concise notes/rules to this file.
