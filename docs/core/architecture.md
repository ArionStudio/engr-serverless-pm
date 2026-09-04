# Core architecture

Status: current implementation

`@lfspm/core` owns the password manager's domain contracts and application
workflows. It is platform-independent TypeScript. It does not import Chrome
APIs, React, IndexedDB, WebCrypto implementations, or AWS clients.

The extension supplies those capabilities through ports:

```text
popup, options, and background runtime
                  |
                  v
        extension composition code
           /                 \
          v                   v
   core use cases     extension adapters
          |                   |
          v                   |
   services and ports <-------+
          |
          v
       domain model
```

At runtime, a use case calls a port interface and the injected adapter performs
the browser, persistence, cryptographic, or remote operation.

## Package structure

| Directory                | Current responsibility                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/domain`             | Persisted and in-memory contracts, schemas, pure mapping, validation, version-vector operations, and internal mutations              |
| `src/use-cases`          | The 33 application workflow entry points and their command/result contracts                                                          |
| `src/services`           | Shared stateful actions used by more than one workflow, including session, snapshot, sync, trust, clipboard, and randomness behavior |
| `src/ports`              | Capabilities that the runtime must implement                                                                                         |
| `src/errors`             | Expected domain and workflow failures exposed to callers                                                                             |
| `src/lib`                | Standalone utilities for base64url, password tools, and best-effort buffer wiping                                                    |
| `src/__tests__/fixtures` | Deterministic ports, values, and workflow fixtures used by tests                                                                     |

The [package guide](../../packages/core/README.md) lists the public import paths.
Internal files are not package entry points even when their symbols are used
inside core.

## Workflow boundary

Callers start application behavior through a use-case class. Use cases validate
their command, load the required session or persisted state, and coordinate
domain changes and ports. Their promises resolve with a caller-facing result.
Expected validation and workflow failures reject with public project-specific
errors; dependency failures may propagate unchanged.

Visible read and search workflows obtain the active unlocked context and map
secrets out of their results. Dedicated operations such as password retrieval
and clipboard copy intentionally expose or use a secret. Mutating workflows
normally:

1. prove ownership of the active session and source snapshot;
2. create a new immutable vault state;
3. persist a signed snapshot with compare-and-swap expectations;
4. when sync is configured, attempt the conditional upload while preserving
   the authority needed to roll back a definite failure;
5. commit the surviving persisted revision back into the active session.

Without sync, the session commit follows local persistence directly. With
sync, a committed upload attempts an ownership-checked intent clear; if that
cannot be confirmed, the intent remains pending for reconciliation. An unknown
upload outcome also keeps the candidate durable and pending. A definite
non-commit attempts an ownership-checked rollback before the session is
committed; if rollback can no longer prove ownership, core reports that
recovery is incomplete.

## Services

Services own shared actions rather than complete user workflows. Important
examples are:

- `UnlockedVaultSessionService`, which coordinates the split session records
  and active-session ownership;
- `VaultSnapshotService`, which creates, verifies, persists, and restores signed
  snapshots;
- `VaultSyncGuardService`, which checks remote state and tracks uploads and
  provider credentials;
- `VaultTrustService`, which creates and verifies trust chains and checkpoints;
- `VaultLifecycleCleanupService`, which coordinates lock and local-delete
  cleanup;
- `ClipboardClearService`, which clears only clipboard values still owned by the
  scheduled action;
- `RandomSamplerService`, which converts runtime randomness into unbiased
  bounded samples.

The package exposes shared constructors needed for public use-case composition
and runtime coordination through `@lfspm/core/services`. Current extension
composition imports session, snapshot, sync, lifecycle, and clipboard services
from that path. The randomness service is available for password-tool
composition. Internal trust services are not part of the entry point. The old
development document that called all services private predates this package
contract.

## Ports and adapters

Core defines ports for:

- cryptography and BIP39 conversion;
- local vault and split-session persistence;
- remote snapshot sync;
- clipboard access and clipboard ownership coordination;
- clock, identifiers, and scheduled tasks;
- vault display names and task ownership records.

Concrete implementations live under `apps/extension/src/adapters`. They include
WebCrypto, IndexedDB, Chrome storage and alarms, Web Locks, the offscreen
clipboard bridge, and AWS S3.

Provider-specific configuration schemas and semantic validation stay outside
the core model. Core carries target and credential configuration as JSON-shaped
provider records and passes them to the selected sync adapter.

## Composition status

`apps/extension/src/core-composition-api.typecheck.ts` proves at compile time
that extension ports can compose shared service instances and representative
use cases through the public package entry points. Background runtime modules
also compose the lock and clipboard alarm workflows.

The compile-time fixture is not a full production application container. The
popup currently renders a placeholder and the options page exposes theme
settings. Wiring the complete core API into the UI remains application work
outside the core package.

## Related documentation

- [Domain model](./domain-model.md)
- [Workflow inventory](./workflows.md)
- [Security model](./security-model.md)
- [Core architecture standard](../standards/core-architecture.md)
- [Ports and adapters standard](../standards/ports-adapters-and-runtime-validation.md)
