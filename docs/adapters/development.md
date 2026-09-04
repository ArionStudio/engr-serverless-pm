# Adapter development guide

Status: current contributor guide

The [port and adapter standard](../standards/ports-adapters-and-runtime-validation.md)
owns the rules. This guide turns those rules into the normal repository
workflow.

## Decide the owner first

Before adding a file, identify what the behavior means:

- Put stable domain types and product policy in core.
- Add or change a core port only when core needs an external capability.
- Put browser, storage, SDK, provider, and third-party library integration in an
  extension adapter.
- Put runtime construction in composition code.
- Keep a portable default service in core when it owns product policy rather
  than environment access. `RandomVaultDisplayNameService` is the current
  example.

Do not create a pass-through service merely to rename a port call. Do not add a
port for a helper that core can implement as a pure function.

## Choose the adapter directory

| Directory            | Responsibility                                                       |
| -------------------- | -------------------------------------------------------------------- |
| `adapters/crypto`    | WebCrypto and recovery encoding implementations                      |
| `adapters/storage`   | IndexedDB and Chrome storage repositories                            |
| `adapters/codecs`    | Runtime decoding and encoding for persisted or transferred artifacts |
| `adapters/clipboard` | Clipboard access, hashing, and cross-context coordination            |
| `adapters/system`    | Clock, identifiers, alarms, and scheduled-task records               |
| `adapters/sync`      | Remote provider implementations and provider responses               |
| `adapters/device`    | Device-to-device enrollment transports                               |

Use a named class for a stateful or injectable implementation. A small pure
codec may use named functions. Export only values that production composition
or a deliberate extension recovery boundary needs.

## Name the boundary role

Reserve `Port` and `.port.ts` for contracts declared by core. Name every
concrete implementation with the `Adapter` suffix and store it in an
`.adapter.ts` file. Use the shortest name that identifies both the technology
and capability:

```text
ClockPort in clock.port.ts
SystemClockAdapter in system-clock.adapter.ts

Bip39Port in bip39.port.ts
ScureBip39Adapter in scure-bip39.adapter.ts

VaultLocalRepositoryPort in vault-local-repository.port.ts
IndexedDbVaultLocalRepositoryAdapter in indexeddb-vault-local-repository.adapter.ts
```

Do not name a concrete implementation `WebCryptoPort` or place it in an adapter
`*.port.ts` file. Codecs, transport serializers, platform API seams, and other
supporting components that do not implement a core port keep their precise role
names, such as `.codec.ts`, `.transport.ts`, or `.type.ts`.

## Implement against the port

Read the complete port and all current callers before writing the adapter.
Preserve its asynchronous behavior, ownership rules, return values, and stated
failure semantics. Do not invent retries, caching, normalization, or fallback
behavior in the adapter.

Inject the narrowest platform seam needed by the implementation. For example,
`WebCryptoIdAdapter` accepts only `randomUUID`, and `SystemClockAdapter` accepts
a time-reading function. Constructors normally retain dependencies without
touching application data. Chrome storage repositories are the narrow
exception: they may start the required access-level restriction and make every
operation await the retained setup promise.

## Handle runtime values

Treat values from storage, JSON, messages, providers, and untyped libraries as
`unknown`. Decode the complete shape before using it. Reject extra or impossible
fields when they could change signed, encrypted, persisted, or authorization
meaning.

Copy mutable values at ownership boundaries. A returned DTO must not alias
adapter state. An operation that retains a mutable comparison value across an
`await` needs an owned snapshot before the asynchronous work starts.

For secret buffers, record who owns each copy and where it is wiped. Never wipe
a caller-owned buffer. JavaScript string erasure is not reliable, so do not
claim that mnemonic or password strings are wiped.

## Assign errors

Ask whether another implementation of the same port could produce the same
meaningful failure.

If yes, define the error or explicit outcome in core and document it on the
port. The adapter maps native or library failures to that portable contract.

If no, the adapter may own a static error for its storage record, message
format, or provider response. Core must not import that class. Sensitive native
errors are replaced rather than wrapped because a nested cause can retain the
input.

## Add a dependency only after approval

Follow `REPO-002` before changing a manifest. For a security or protocol
library, record the exact version, license, runtime dependencies, source and
release review, browser compatibility, bundle result, and known-answer test
source. Keep its types and errors out of core.

## Compose the instance

Add the adapter to its narrow category barrel, then construct it in the owning
composition graph. Reuse the same object only when its state or identity matters
to correctness. Namespace imports and global registries do not control
instance lifetime.

Until the full application container exists, update
`core-composition-api.typecheck.ts` so TypeScript resolves the production class
through supported package and adapter exports.

## Test and validate

An adapter unit test normally covers:

- exact delegation and return values;
- malformed runtime input at every accepted boundary;
- native or dependency failure mapping;
- caller-input preservation and returned-value independence;
- adapter-owned cleanup on success and failure;
- stateful concurrency, compare-and-set, or transaction behavior when present.

Use the real adapter in at least one workflow integration test for a
security-sensitive or persisted path. A browser-backed library also needs a
production build or focused Vite bundle check. Core fakes remain useful for
workflow ordering, but they do not prove the adapter.

Run focused tests while editing. Before handoff, run the affected package gates
from the repository root:

```bash
pnpm core:type-check
pnpm core:test --run
pnpm --filter @lfspm/extension run type-check
pnpm ext:test --run
pnpm ext:lint
pnpm ext:build
git diff --check
```

Run generated-data verifiers when the adapter or its supporting service uses a
pinned corpus. Check formatting for every changed code and documentation file.
