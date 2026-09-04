# BIP39 recovery adapter implementation plan

Status: approved, implemented, and validated on
`feature/extension/remaining-adapters`.

Baseline: `be85b607` (merged core documentation, 2026-09-04).

This document is an implementation plan, not a normative standard. The rules
that constrain the work remain under [`docs/standards`](../../standards/README.md).

## Definition

[`Bip39Port`](../../../packages/core/src/ports/crypto/bip39.port.ts) defines two
asynchronous conversions:

```ts
export interface Bip39Port {
  recoveryKeyToMnemonic: (
    recoverySecretKey: RecoverySecretKey,
  ) => Promise<RecoveryKeyMnemonic>;
  mnemonicToRecoveryKey: (
    mnemonic: RecoveryKeyMnemonic,
  ) => Promise<RecoverySecretKey>;
}
```

This capability encodes and recovers entropy. It must not use BIP39's optional
mnemonic-to-seed derivation. Under the active
[`spm-v1` algorithm suite](../../../packages/core/src/domain/crypto/algorithm-suite.const.ts),
the recovery key is exactly 32 bytes and the mnemonic is exactly 24 words with
`format: "BIP39"`.

The port's ownership contract is part of the definition:

- encoding must neither mutate nor retain the caller-owned key;
- each decoded key must be a fresh caller-owned buffer;
- decoded results must not alias adapter state, dependency state, or an earlier
  result.

## Portability and current ownership

`Bip39Port` is a general LFSPM recovery contract. It contains no Chrome type or
browser API. The same 32-byte entropy and 24-word `spm-v1` conversion must work
in every LFSPM client.

The concrete implementation stays under extension crypto adapters for now
because the extension is the only production client and owns the runtime
dependency. The selected library is portable ESM rather than Chrome-specific
code. If another client later needs it, extract the adapter into a shared
package without changing the core port or protocol.

## Pre-implementation gap

The extension had no production `Bip39Port` adapter and no direct dependency
that implements BIP39. Core tests use a deterministic fake with intentionally
non-production three-word values. Extension workflow integration tests also
substituted fake conversion behavior, so they did not verify BIP39 wordlist,
checksum, byte length, buffer ownership, or browser bundling.

## Approved dependency and input policy

The approved implementation uses the maintained public library
[`@scure/bip39`](https://github.com/paulmillr/scure-bip39), which provides ESM
exports, a separate English wordlist, direct `entropyToMnemonic` conversion,
and `mnemonicToEntropy` returning mutable `Uint8Array` bytes. Its package is MIT
licensed and has one declared runtime dependency, `@noble/hashes`.

Version `2.4.0` is pinned exactly in `@lfspm/extension`. The package archive and
the `2.3.0..2.4.0` source diff were reviewed before installation. Its sole
runtime dependency is the exact `@noble/hashes@2.4.0`; SHA-256, which BIP39 uses,
did not change across that dependency update. Vendoring or maintaining a local
BIP39 implementation was rejected.

The approved `spm-v1` input policy uses the standard English wordlist with one
lowercase word per array element; reject wrong casing,
surrounding whitespace, unknown words, wrong word counts, and invalid checksum
instead of silently repairing input. UI tokenization and normalization may be
designed separately before it constructs `RecoveryKeyMnemonic`.

The release review covered:

- direct entropy-to-mnemonic and mnemonic-to-entropy APIs for 256-bit entropy;
- official BIP39 vector conformance and checksum validation;
- a pinned English wordlist and license;
- browser ESM and Manifest V3 compatibility with no Node-only globals;
- maintenance history, bundle cost, and transitive dependencies;
- whether mutable inputs and returned entropy can be detached and wiped.

The approved implementation must accept binary entropy and return decoded
entropy as mutable bytes. A string-only or hex-only entropy API is not
acceptable because it creates an avoidable immutable secret representation. Any
exception requires a separate explicit security decision.

## Library research record

Review these sources before approving and pinning the dependency:

- [GitHub repository and usage](https://github.com/paulmillr/scure-bip39)
- [npm package and published versions](https://www.npmjs.com/package/@scure/bip39)
- [entropy conversion implementation](https://github.com/paulmillr/scure-bip39/blob/main/src/index.ts)
- [English BIP39 wordlist](https://github.com/paulmillr/scure-bip39/blob/main/src/wordlists/english.ts)
- [package metadata and dependencies](https://github.com/paulmillr/scure-bip39/blob/main/package.json)
- [release history](https://github.com/paulmillr/scure-bip39/releases)
- [security policy](https://github.com/paulmillr/scure-bip39/security)
- [MIT license](https://github.com/paulmillr/scure-bip39/blob/main/LICENSE)
- [Cure53 audit report](https://cure53.de/pentest-report_hashing-libs.pdf)
- [audit copy in the repository](https://github.com/paulmillr/scure-bip39/blob/main/audit/2022-01-05-cure53-audit-nbl2.pdf)

At the time of this research, npm listed `2.4.0` as the latest release. The
implementation pins that exact version based on its reviewed archive and source
diff rather than relying only on the `latest` tag. A dedicated Vite browser
bundle smoke check, run with
`pnpm --filter @lfspm/extension check:bip39-bundle`, covers the adapter and
English wordlist, while the production build rejects accidental inclusion of
that wordlist in the alarm-only background service worker. Adapter tests pin an
official 256-bit vector.

The independent Cure53 assessment covered the earlier `micro-bip39`
implementation and reported no findings for that component within its audit
scope. It does not prove that every later release is defect-free. The project
also records a full self-audit for version `2.2.0`; changes after that version
still require review.

## Requirements

### Protocol behavior

- Preserve the existing `spm-v1` identifiers and persisted shapes.
- Read entropy and word-count requirements from `CURRENT_ALGORITHM_SUITE`; do
  not establish independent values that can drift from the suite.
- Encode 32 bytes of entropy as a checksum-valid 24-word BIP39 mnemonic under
  the approved wordlist.
- Decode the 24 words back to the identical 32 bytes of entropy, not a BIP39
  seed.
- Reject wrong format, shape, words, checksum, or recovered byte length before
  core uses the result.

### Secret ownership

- Validate key length before giving bytes to the implementation dependency.
- Do not mutate or wipe caller-owned buffers.
- Copy caller entropy before passing it to code whose retention behavior is not
  controlled, then best-effort wipe the adapter-owned copy in `finally`.
- Copy decoded dependency output into one fresh caller-owned `ArrayBuffer` and
  best-effort wipe the temporary mutable output before release.
- Return a detached word array rather than dependency- or adapter-owned mutable
  state. Mnemonic strings cannot be reliably erased; documentation must not
  claim otherwise.

### Errors and boundaries

- Use core-owned `RecoveryMnemonicEncodingError` and
  `InvalidRecoveryMnemonicError` because callers need the same failure contract
  for every `Bip39Port` implementation.
- Never include recovery words, joined phrases, raw bytes, hostile values, or a
  dependency/native cause in the error graph.
- Let already-sanitized project errors pass only when their complete graph is
  known to be secret-safe.
- Keep the dependency and all wordlist-specific behavior in the extension
  adapter; core must not import the package.
- Use strict TypeScript, named exports, type-only imports, no `any`, and no
  `delete`.

## Required final state

1. Complete the approval gate and record the selected implementation, pinned
   version/source, license, wordlist, and input policy.
2. Add only the exact approved `@scure/bip39` version to `@lfspm/extension`
   from the repository root, then review both `apps/extension/package.json` and
   `pnpm-lock.yaml`.
3. Add core-owned `RecoveryMnemonicEncodingError` and
   `InvalidRecoveryMnemonicError` classes with stable messages and no `cause`.
   Document them as the portable `Bip39Port` failure contract.
4. Add `apps/extension/src/adapters/crypto/scure-bip39.adapter.ts` with a named
   `ScureBip39Adapter` class implementing `Bip39Port` beside the Web Crypto
   adapter.
5. Validate suite-declared entropy length before encoding. Convert through an
   owned temporary and verify that the result contains exactly the
   suite-declared number of supported words.
6. Validate the complete mnemonic structure before decoding, require wordlist
   membership and checksum validity, recover entropy, and verify the
   suite-declared byte length.
7. Implement the ownership and best-effort cleanup rules on every success and
   failure path.
8. Export only the adapter through
   `apps/extension/src/adapters/crypto/index.ts`. Export the portable errors
   through the core package root.
9. Replace fake BIP39 conversion in the IndexedDB initialization/recovery
   workflow integration test with the concrete adapter. Recover with the exact
   mnemonic returned by initialization.
10. Use the concrete adapter in the device-enrollment workflow integration test
    so the returned recovery mnemonic is production-valid.
11. Add caller failure tests only where existing core tests do not already
    prove cleanup and zero forbidden effects for encode/decode failures.

## Test plan

### Adapter tests

Add `apps/extension/src/adapters/crypto/scure-bip39.adapter.test.ts` with:

- official 256-bit entropy/24-word known-answer vectors in both directions;
- round trips across separate adapter instances;
- rejection of zero-, 31-, 33-byte, and detached key buffers;
- rejection of extra object fields, non-plain objects, wrong format, a
  non-array or sparse `words` value, accessor-backed properties, wrong word
  count, non-string words, unknown words, and a valid-word sequence with a bad
  checksum;
- explicit tests for the approved casing, whitespace, and Unicode policy;
- proof that two decodes return equal bytes in distinct buffers;
- mutation checks for caller key buffers and caller word arrays;
- two encodes of the same entropy return distinct word arrays; mutating one
  result cannot affect the other result or a later encoding;
- cleanup checks for adapter-owned mutable copies on success and injected
  dependency failure;
- recursive error-graph checks proving that input, bytes, and unsafe causes are
  absent.

The official vectors must come from the approved source and remain pinned; the
core fake's three-word fixture must not be reused as an adapter fixture.

### Caller and workflow tests

- Initialization encode failure: propagate a safe error, wipe owned candidates,
  and perform no persistence or activation.
- Enrollment encode failure: create no local vault/session and leave the
  pending enrollment retryable.
- Recovery decode failure: perform no recovery derivation or access-record
  write.
- Replacement encode failure during recovery: wipe owned secrets and preserve
  existing access records; allow only a trust-checkpoint update already
  authorized before the replacement conversion.
- Real-adapter integration: initialize, persist with IndexedDB, and recover
  using the exact returned mnemonic.
- Real-adapter enrollment: return a valid 24-word mnemonic.
- Consumer compile and production build: resolve the barrel export, bundle the
  wordlist, and use no Node-only API.

Run from the repository root:

```bash
pnpm --filter @lfspm/extension exec vitest run \
  src/adapters/crypto/scure-bip39.adapter.test.ts \
  src/adapters/storage/indexeddb-vault-local.workflow-integration.test.ts \
  src/adapters/device/json-text-device-enrollment.workflow-integration.test.ts
pnpm core:type-check
pnpm core:test --run
pnpm --filter @lfspm/extension run type-check
pnpm ext:test --run
pnpm ext:lint
pnpm ext:build
pnpm --filter @lfspm/extension exec prettier --check .
git diff --check
```

## Acceptance criteria

- Every `spm-v1` 32-byte recovery key encodes to a standard-valid 24-word
  mnemonic under the approved wordlist.
- Decoding returns byte-for-byte identical 32-byte entropy, never a BIP39 seed.
- Invalid format, shape, membership, checksum, and byte length fail closed
  before core uses the invalid conversion result.
- Each decode returns a fresh caller-owned buffer; caller inputs remain
  unchanged and adapter-owned mutable temporaries are best-effort wiped on all
  exits.
- Error graphs contain no recovery words, raw bytes, dependency error, or
  secret-bearing cause.
- `ScureBip39Adapter` is a named crypto-adapter export from an `.adapter.ts`
  module. Portable errors are named core exports and the adapter does not
  expose a separate failure contract.
- Real-adapter workflows cover initialization, recovery, and enrollment.
- No existing `spm-v1` identifier or persisted artifact shape changes.
- Full core and extension validation passes.

## Out of scope

- BIP39 mnemonic-to-seed derivation or passphrases.
- Recovery-word revocation. Replacing the current local backup does not
  invalidate copied older backups; see the accepted
  [recovery semantics](../../review/unresolved-findings/10-recovery-word-semantics.md).
- Building the full production core composition root.
- Changing `spm-v1`, recovery backup formats, or core public contracts without
  a separate approved protocol decision.

## Evidence

- Port and types:
  [`bip39.port.ts`](../../../packages/core/src/ports/crypto/bip39.port.ts),
  [`bip39-mnemonic.ts`](../../../packages/core/src/domain/recovery/bip39-mnemonic.ts),
  and
  [`brand-keys.ts`](../../../packages/core/src/domain/recovery/brand-keys.ts)
- Active suite:
  [`algorithm-suite.const.ts`](../../../packages/core/src/domain/crypto/algorithm-suite.const.ts)
- Callers:
  [`initialize-vault.ts`](../../../packages/core/src/use-cases/vault-lifecycle/initialize-vault.ts),
  [`perform-device-enrollment.ts`](../../../packages/core/src/use-cases/device-trust/perform-device-enrollment.ts),
  and
  [`recover-device-access.ts`](../../../packages/core/src/use-cases/device-trust/recover-device-access.ts)
- Current fake and integration gap:
  [`ports.ts`](../../../packages/core/src/__tests__/fixtures/ports.ts),
  [`indexeddb-vault-local.workflow-integration.test.ts`](../../../apps/extension/src/adapters/storage/indexeddb-vault-local.workflow-integration.test.ts),
  and
  [`json-text-device-enrollment.workflow-integration.test.ts`](../../../apps/extension/src/adapters/device/json-text-device-enrollment.workflow-integration.test.ts)
- Applicable standards:
  [`cryptography-and-secret-ownership.md`](../../standards/cryptography-and-secret-ownership.md),
  [`errors-logging-and-sensitive-data.md`](../../standards/errors-logging-and-sensitive-data.md),
  [`ports-adapters-and-runtime-validation.md`](../../standards/ports-adapters-and-runtime-validation.md),
  and
  [`testing-and-validation.md`](../../standards/testing-and-validation.md)
- External algorithm definition:
  [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)
- Preferred implementation candidate:
  [`@scure/bip39` source](https://github.com/paulmillr/scure-bip39),
  [`entropy conversion API`](https://github.com/paulmillr/scure-bip39/blob/main/src/index.ts),
  and
  [`English wordlist`](https://github.com/paulmillr/scure-bip39/blob/main/src/wordlists/english.ts)
