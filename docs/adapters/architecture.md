# Adapter architecture and catalog

Status: current implementation

## Dependency direction

Core declares ports for capabilities it cannot perform itself. The extension
implements those ports and composition code supplies the instances to core use
cases and services.

```text
extension UI and runtime events
              |
              v
      extension composition
          /          \
         v            v
  core use cases   concrete adapters
         |            |
         v            |
      core ports <----+
```

Core never imports an extension module. An adapter may import core ports,
domain contracts, and portable errors. Provider SDKs, browser APIs, storage
records, and library-specific types stop at the adapter boundary.

## Current port implementations

Every concrete adapter uses the `*Adapter` symbol suffix and lives in the
matching kebab-case `.adapter.ts` file. Core contracts retain `*Port` and
`.port.ts`. Codec, transport, and API-seam modules keep their actual role suffix
because they do not implement a core port.

| Core capability                                                                                                                                         | Current implementation                                                                                                                                                               | Current owner and portability                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [CryptoPort](../../packages/core/src/ports/crypto/crypto.port.ts)                                                                                       | [WebCryptoAdapter](../../apps/extension/src/adapters/crypto/web-crypto.adapter.ts)                                                                                                   | Extension crypto adapter using the standard WebCrypto API. It can move to a shared adapter package if another browser-based client needs it.   |
| [Bip39Port](../../packages/core/src/ports/crypto/bip39.port.ts)                                                                                         | [ScureBip39Adapter](../../apps/extension/src/adapters/crypto/scure-bip39.adapter.ts)                                                                                                 | Extension crypto adapter using exact `@scure/bip39@2.4.0` and the English wordlist. The contract is portable and contains no Chrome type.      |
| [ClockPort](../../packages/core/src/ports/system/clock.port.ts)                                                                                         | [SystemClockAdapter](../../apps/extension/src/adapters/system/system-clock.adapter.ts)                                                                                               | Extension system adapter over `Date.now()`. The class is portable JavaScript but remains extension-owned while there is one production client. |
| [IdPort](../../packages/core/src/ports/system/id.port.ts)                                                                                               | [WebCryptoIdAdapter](../../apps/extension/src/adapters/system/web-crypto-id.adapter.ts)                                                                                              | Extension system adapter over `crypto.randomUUID()`. It has no weak fallback.                                                                  |
| [ScheduledTaskPort](../../packages/core/src/ports/system/scheduled-task.port.ts)                                                                        | [ChromeAlarmsScheduledTaskAdapter](../../apps/extension/src/adapters/system/chrome-alarms-scheduled-task.adapter.ts)                                                                 | Chrome-specific system adapter backed by `chrome.alarms`.                                                                                      |
| [ClipboardPort](../../packages/core/src/ports/clipboard/clipboard.port.ts)                                                                              | [OffscreenClipboardAdapter](../../apps/extension/src/adapters/clipboard/offscreen-clipboard.adapter.ts)                                                                              | Chrome-specific clipboard bridge using an offscreen document and runtime messaging.                                                            |
| [ClipboardSecretHashPort](../../packages/core/src/ports/clipboard/clipboard-secret-hash.port.ts)                                                        | [WebCryptoClipboardSecretHashAdapter](../../apps/extension/src/adapters/clipboard/web-crypto-clipboard-secret-hash.adapter.ts)                                                       | Extension clipboard adapter using SHA-256 through WebCrypto.                                                                                   |
| [ClipboardOperationCoordinatorPort](../../packages/core/src/ports/clipboard/clipboard-operation-coordinator.port.ts)                                    | [WebLocksClipboardOperationCoordinatorAdapter](../../apps/extension/src/adapters/clipboard/web-locks-clipboard-operation-coordinator.adapter.ts)                                     | Browser adapter using one origin-scoped Web Lock across extension contexts.                                                                    |
| [VaultLocalRepositoryPort](../../packages/core/src/ports/vault/vault-local-repository.port.ts)                                                          | [IndexedDbVaultLocalRepositoryAdapter](../../apps/extension/src/adapters/storage/indexeddb-vault-local-repository.adapter.ts)                                                        | IndexedDB adapter backed by Dexie. It owns atomic local-vault persistence and compare-and-set behavior.                                        |
| [EncryptedUnlockedVaultSessionPayloadRepositoryPort](../../packages/core/src/ports/session/encrypted-unlocked-vault-session-payload-repository.port.ts) | [IndexedDbEncryptedUnlockedVaultSessionPayloadRepositoryAdapter](../../apps/extension/src/adapters/storage/indexeddb-encrypted-unlocked-vault-session-payload-repository.adapter.ts) | IndexedDB repository for the encrypted half of unlocked session state.                                                                         |
| [UnlockedVaultSessionMaterialRepositoryPort](../../packages/core/src/ports/session/unlocked-vault-session-material-repository.port.ts)                  | [ChromeUnlockedVaultSessionMaterialRepositoryAdapter](../../apps/extension/src/adapters/storage/chrome-unlocked-vault-session-material-repository.adapter.ts)                        | Chrome session-storage repository for volatile usable key material and session ownership.                                                      |
| [ClipboardClearTaskRepositoryPort](../../packages/core/src/ports/clipboard/clipboard-clear-task-repository.port.ts)                                     | [ChromeClipboardClearTaskRepositoryAdapter](../../apps/extension/src/adapters/storage/chrome-clipboard-clear-task-repository.adapter.ts)                                             | Chrome storage repository for clipboard-clear ownership metadata.                                                                              |
| [VaultLockTaskRepositoryPort](../../packages/core/src/ports/vault/vault-lock-task-repository.port.ts)                                                   | [ChromeVaultLockTaskRepositoryAdapter](../../apps/extension/src/adapters/storage/chrome-vault-lock-task-repository.adapter.ts)                                                       | Chrome storage repository for vault-lock ownership metadata.                                                                                   |
| [SyncProviderPort](../../packages/core/src/ports/sync/sync-provider.port.ts)                                                                            | [AwsS3SyncProviderAdapter](../../apps/extension/src/adapters/sync/aws-s3-sync-provider.adapter.ts)                                                                                   | AWS-specific provider adapter. Core continues to carry provider configuration as JSON-shaped data.                                             |
| [VaultDisplayNamePort](../../packages/core/src/ports/vault/vault-display-name.port.ts)                                                                  | [RandomVaultDisplayNameService](../../packages/core/src/services/vault/random-vault-display-name.service.ts)                                                                         | Portable core service. It uses `RandomSamplerService` and shared normalized EFF words, so it is not a browser adapter.                         |

`JsonTextDeviceEnrollmentTransport` is a delivery adapter rather than a core
port implementation. It serializes and decodes enrollment requests and
responses for transfer between devices.

## Runtime validation and codecs

Values read from IndexedDB, Chrome storage, extension messages, enrollment
text, and S3 enter codecs as `unknown`. The codec validates the complete record
before core or cryptography receives it. The shared codec primitives handle
small encoding facts, while each artifact family keeps its own decoder and
error.

Current codec owners are:

- `device-enrollment-artifact.codec.ts` for enrollment messages, pending
  enrollment state, and protected enrollment private state;
- `local-vault-security.codec.ts` for local descriptors, device access records,
  trust checkpoints, and protected local keys;
- `vault-snapshot.codec.ts` for snapshots, descriptors, identities, vault
  content, trust anchors, and opened vault keys;
- `unlocked-session-payload.codec.ts` and
  `unlocked-vault-session-material.codec.ts` for the split session boundary;
- `sync-credential.codec.ts` for encrypted provider credential state;
- `scheduled-task-record.codec.ts` for alarm names and ownership records.

## Error ownership

The code distinguishes portable failures from representation failures.

A failure that core or a caller must recognize across implementations belongs
to core. For example, `InvalidRecoveryMnemonicError` and
`RecoveryMnemonicEncodingError` are core errors. `ScureBip39Adapter` detects
malformed input or library failure, removes the unsafe native cause, and throws
the portable error.

An adapter may own an error for a representation that only it understands.
Examples include malformed IndexedDB records and invalid S3 response bodies.
Core does not import or branch on these error classes. An outer extension
boundary may use them for a safe recovery path or report a static failure.

Native and dependency exceptions must not carry recovery words, raw keys,
passwords, credentials, or hostile records beyond the adapter that first sees
that sensitive input. The adapter replaces an unsafe exception with a static,
cause-free project error.

## Composition and instance lifetime

Composition code creates concrete adapters and passes them to services and use
cases. Imports do not create or share service instances.

One composition graph reuses an instance when it contains coordination state,
leases, a queue, a cache, or another identity-sensitive resource. Stateless
adapters may have separate instances in separate graphs. Chrome popup,
background, options, and offscreen contexts cannot share JavaScript objects, so
cross-context coordination uses Web Locks, storage, alarms, or messaging.

`apps/extension/src/core-composition-api.typecheck.ts` currently verifies the
public construction graph. Background composition runs the clipboard-clear and
vault-lock alarm workflows. The full popup and options workflow container is
still application work.

## Related documentation

- [Adapter development guide](./development.md)
- [Port and adapter standards](../standards/ports-adapters-and-runtime-validation.md)
- [Core architecture](../core/architecture.md)
- [Core security model](../core/security-model.md)
- [AWS S3 adapter setup](../aws/s3/README.md)
