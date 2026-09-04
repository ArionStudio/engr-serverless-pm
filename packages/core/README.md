# `@lfspm/core`

`@lfspm/core` contains LFSPM's platform-independent domain model and application
workflows. It defines the ports required from a runtime, but it does not contain
Chrome, IndexedDB, WebCrypto, React, or AWS implementations.

The package is private to this workspace and consumed by
`@lfspm/extension`.

## Supported imports

The package exposes three entry points:

| Import                 | Contents                                                      |
| ---------------------- | ------------------------------------------------------------- |
| `@lfspm/core`          | Domain contracts, errors, ports, and use cases                |
| `@lfspm/core/lib`      | Standalone encoding, password-tool, and secure-wipe utilities |
| `@lfspm/core/services` | Shared service constructors needed by public composition      |

Import public contracts from those paths. Files below `src` are implementation
paths and are not consumer entry points.

The services entry point exports `ClipboardClearService`,
`RandomSamplerService`, `UnlockedVaultSessionService`,
`VaultLifecycleCleanupService`, `VaultSessionActivationService`,
`VaultSnapshotService`, `VaultSyncGuardService`, and
`RandomVaultDisplayNameService`. Internal trust services are not exported
through this path. Supporting public types are
`VaultSessionActivationAuthorization`.

```ts
import { AddEntryUseCase } from "@lfspm/core";
import type { IdPort, VaultLocalRepositoryPort } from "@lfspm/core";
import {
  UnlockedVaultSessionService,
  VaultSnapshotService,
  VaultSyncGuardService,
} from "@lfspm/core/services";
```

Composition code constructs one instance of each shared stateful service and
passes those instances to related use cases. The extension compile-time fixture
at `apps/extension/src/core-composition-api.typecheck.ts` is the current
consumer example.

## Source layout

```text
src/
├── domain/       persisted and in-memory contracts plus pure operations
├── errors/       public domain and workflow errors
├── lib/          standalone utilities and password tools
├── ports/        runtime capability interfaces
├── services/     shared core actions used during composition
├── use-cases/    33 application workflow classes
└── __tests__/    shared deterministic fixtures
```

See the [core architecture](../../docs/core/architecture.md),
[domain model](../../docs/core/domain-model.md), and
[workflow inventory](../../docs/core/workflows.md) for the current behavior.

## Commands

Run package checks from the repository root:

```bash
pnpm core:type-check
pnpm core:test --run
pnpm core:verify-common-passwords
pnpm core:verify-username-words
```

Generate the two maintained corpora only when their source or transformation
rules intentionally change:

```bash
pnpm core:generate-common-passwords
pnpm core:generate-username-words
```

Core adapter integration is verified through the extension package:

```bash
pnpm ext:test --run
pnpm --filter @lfspm/extension run type-check
pnpm ext:build
```

## Documentation authority

- [Core documentation](../../docs/core/README.md) describes current behavior.
- [Extension adapter documentation](../../docs/adapters/README.md) maps ports to
  concrete implementations and composition ownership.
- [Code standards](../../docs/standards/README.md) define implementation rules.
- [Current security model](../../docs/core/security-model.md) summarizes the
  implemented trust boundary and safeguards.
- [V1 security specification](../../docs/security/security-specification.md) is
  a non-normative legacy design reference.
