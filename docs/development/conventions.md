# Conventions

This document describes the current conventions for the browser extension code in `apps/extension/src`.

## Architecture Concepts

| Concept         | Suffix         | Purpose                                      | Location                            |
| --------------- | -------------- | -------------------------------------------- | ----------------------------------- | ------- | ------------ |
| **Type**        | `.type.ts`     | Domain models and data contracts             | `core/[domain]/`                    |
| **Port**        | `.port.ts`     | Core interfaces (contracts)                  | `core/[domain]/`                    |
| **Adapter**     | `.adapter.ts`  | Technology-specific port implementations     | `adapters/[domain]/`                |
| **Const**       | `.const.ts`    | Domain constants/defaults                    | `core/[domain]/`                    |
| **Util**        | `.util.ts`     | Pure helper functions                        | `core/[domain]/`, `lib/`, `ui/lib/` |
| **Params**      | `.params.ts`   | Algorithm parameter objects                  | `core/crypto/algorithms/`           |
| **Registry**    | `.registry.ts` | Validated lookup registry (profiles/suites)  | `core/crypto/...`                   |
| **View**        | `.view.tsx`    | Presentational React components              | `ui/views/`, `ui/theme/`            |
| **Hook**        | `.hook.ts`     | React hooks                                  | `ui/theme/`                         |
| **Context**     | `.context.tsx` | React dependency/context wiring              | `ui/theme/`                         |
| **Entry point** | `.tsx` / `.ts` | Extension bootstrap files (popup/options/bg) | `extension/[popup                   | options | background]` |
| **Test**        | `.test.ts`     | Unit/integration tests                       | Next to implementation file         |

## Directory Structure (Current)

```text
apps/extension/src/
├── core/                      # Domain contracts/types (no framework/runtime coupling)
│   ├── crypto/                # Profiles, suites, algorithm definitions, crypto port
│   ├── device/                # Device identity, key contracts, environment metadata
│   ├── organization/          # Templates, tags, shared org-level models
│   ├── passwords/             # Password and folder domain models/utilities
│   ├── session/               # Session activity and lock state models
│   ├── storage/               # IndexedDB storage contracts and record types
│   ├── sync/                  # Cloud sync contracts, provider config, sync state/diff
│   └── vault/                 # Encrypted vault payload/envelope/snapshot types
│
├── adapters/                  # Implementations for core ports
│   ├── crypto/                # Web Crypto adapter
│   ├── device/                # Device key Web Crypto adapter
│   └── storage/               # Dexie adapter
│
├── infrastructure/            # Runtime plumbing (database setup/migrations)
│   └── database/
│
├── extension/                 # Chrome extension entrypoints
│   ├── popup/
│   ├── options/
│   └── background/
│
├── ui/                        # React views/components/theme
│   ├── components/
│   ├── views/
│   ├── theme/
│   ├── lib/
│   └── styles/
│
└── lib/                       # Shared non-UI utilities
```

## Dependency Rules

- `core/` must remain framework-agnostic and adapter-agnostic.
- `adapters/` may import from `core/` but never from `ui/`.
- `ui/` can import from `core/` and use injected adapters.
- `extension/` bootstraps runtime wiring only.
- `infrastructure/` can be used by adapters/entrypoints, not by core domain types.

## Ports

Ports in `core/` define what the app needs, not how it is implemented.

```typescript
// apps/extension/src/core/storage/storage.port.ts
export interface StoragePort {
  saveVault(vault: EncryptedVaultRecord): Promise<void>;
  loadVault(): Promise<EncryptedVaultRecord | null>;
  clearVault(): Promise<void>;
}
```

## Adapters

Adapters implement ports and handle platform specifics.

```typescript
// apps/extension/src/adapters/storage/dexie-storage.adapter.ts
export class DexieStorageAdapter implements StoragePort {
  async saveVault(vault: EncryptedVaultRecord): Promise<void> {
    // persistence details
  }
}
```

## Types

Use plain TypeScript types/interfaces for domain modeling.

```typescript
// apps/extension/src/core/storage/storage.type.ts
export interface EncryptedVaultRecord {
  readonly vaultId: string;
  readonly profileId: CryptoProfileId;
  readonly data: Uint8Array;
}
```

## UI Conventions

- Presentational components: `*.view.tsx`
- Theme state/wiring: `theme.context.tsx`, `theme.hook.ts`
- Shared UI primitives in `ui/components/primitives/`
- Shared class helpers in `ui/lib/`

## Testing Conventions

- Keep tests next to implementation (`*.test.ts`).
- Test core behavior through ports and adapters.
- Prefer deterministic fixtures for crypto/storage tests.

## Naming Guidelines

- Prefer descriptive nouns for interfaces (`CryptoPort`, `StoragePort`, `SyncPort`).
- Avoid `I*` interface prefixes.
- Keep crypto constants/suite data in `core/crypto/**`, not in adapters.
- Keep payload/domain types free of redundant algorithm metadata when profile already selects suite.

## Barrel Exports

Use barrel `index.ts` only when a folder exposes a stable public API surface. Do not add barrels for internal-only folders.
