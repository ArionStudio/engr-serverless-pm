# CLAUDE.md - Agent Rulebook

> Last updated: 2026-01-25

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
| Cloud Sync      | AWS S3 + Cognito                  |
| Testing         | Vitest                            |
| Package Manager | pnpm                              |

## Essential Commands

```bash
pnpm ext:dev      # Dev mode (already running in background - don't start)
pnpm ext:build    # Build
pnpm ext:lint     # Lint
pnpm ext:test     # Test
```

Always run from repo root. Never `cd` into subdirectories.

---

## The "Never" List

- **NEVER** use `any` type
- **NEVER** install dependencies without asking
- **NEVER** use default exports (except entry points)
- **NEVER** use `console.log` in production
- **NEVER** use `npm` or `yarn` - pnpm only
- **NEVER** use `react-icons` - use `@phosphor-icons/react`
- **NEVER** use shadcn directly - we use Base UI now

---

## Active Gotchas

<!-- Add mistakes here as they occur -->

- **Type imports**: Use `import type { X }` for type-only imports (verbatimModuleSyntax)
- **Base UI migration**: Some shadcn remnants exist. Use Base UI patterns for new code.
- **Theme context**: Components using `useTheme()` need `ThemeProvider` wrapper.
- **CVA + cn()**: Always merge CVA variants with `cn()` utility.
- **Context files**: Use `/* eslint-disable react-refresh/only-export-components */` for files exporting both Provider and hook (e.g., `theme.context.tsx`). This pattern is idiomatic React.

---

## Architecture (Hexagonal)

```
┌─────────────────────────────────────┐
│           UI Layer                  │  React, Zustand, Base UI
│  (src/ui/, src/extension/)          │
├─────────────────────────────────────┤
│        Adapters Layer               │  WebCrypto, Dexie.js, AWS SDK
│  (src/adapters/)                    │
├─────────────────────────────────────┤
│          Core Layer                 │  Types + Ports (NO dependencies)
│  (src/core/)                        │
└─────────────────────────────────────┘
```

**Import direction**: `core` → `adapters` → `ui`

Never violate this flow. Core is pure, adapters implement core, UI consumes adapters.

---

## Security Model

### Encryption (WebCrypto)

- **Key Derivation**: PBKDF2-SHA256, 600,000 iterations
- **Symmetric**: AES-256-GCM with random IV per operation
- **Signing**: Ed25519 for device identity
- **Key Exchange**: ECDH P-256 for device key slots
- **Key Storage**: Encrypted vault + wrapped device keys in IndexedDB; Vault Key in memory only

### Serverless Constraints

| CAN Do                        | CANNOT Do                  |
| ----------------------------- | -------------------------- |
| Client-side encryption        | Server-side validation     |
| Store encrypted data in cloud | Real-time push sync        |
| Client-enforced device list   | Server-enforced revocation |
| Manual pull-based sync        | Central session management |

---

## Data Flow

```
User → Extension UI → Core (encrypt) → Adapters → IndexedDB (primary)
                                                        ↓
                                              S3 (optional, if sync enabled)
                                                        ↓
Other Device ← Extension UI ← Core (decrypt) ← Adapters ← IndexedDB
```

> **Local-first:** IndexedDB is the primary storage. S3 sync is optional for multi-device use.

---

## Before Completing Any Task

- [ ] `pnpm ext:lint` passes
- [ ] `pnpm ext:build` succeeds
- [ ] No unused imports/variables
- [ ] Type-only imports use `import type`
- [ ] Update `TODO.md` if task status changed

---

## Key Files

| File                        | Purpose                      |
| --------------------------- | ---------------------------- |
| `TODO.md`                   | Task list with scope markers |
| `security-specification.md` | Detailed security model      |
| `CONTRIBUTING.md`           | Commit conventions           |
| `docs/aws/s3-cognito/`      | CloudFormation + AWS docs    |
| `apps/extension/`           | Chrome extension source      |

---

## Revert & Update Workflow

When agent makes a mistake:

1. Revert the bad code
2. Add gotcha to this file
3. Restart with adjusted prompt
