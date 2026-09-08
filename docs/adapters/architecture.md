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
| [ClipboardPort](../../packages/core/src/ports/clipboard/clipboard.port.ts) | [OffscreenClipboardAdapter](../../apps/extension/src/adapters/clipboard/offscreen-clipboard.adapter.ts) or [NavigatorClipboardAdapter](../../apps/extension/src/adapters/clipboard/navigator-clipboard.adapter.ts) | [createBrowserClipboardAdapter](../../apps/extension/src/adapters/clipboard/browser-clipboard.factory.ts) selects the Chromium offscreen bridge or direct clipboard access in Firefox extension documents. |
| [ClipboardSecretHashPort](../../packages/core/src/ports/clipboard/clipboard-secret-hash.port.ts)                                                        | [WebCryptoClipboardSecretHashAdapter](../../apps/extension/src/adapters/clipboard/web-crypto-clipboard-secret-hash.adapter.ts)                                                       | Extension clipboard adapter using SHA-256 through WebCrypto.                                                                                   |
| [ClipboardOperationCoordinatorPort](../../packages/core/src/ports/clipboard/clipboard-operation-coordinator.port.ts)                                    | [WebLocksClipboardOperationCoordinatorAdapter](../../apps/extension/src/adapters/clipboard/web-locks-clipboard-operation-coordinator.adapter.ts)                                     | Browser adapter using one origin-scoped Web Lock across extension contexts.                                                                    |
| [VaultLocalRepositoryPort](../../packages/core/src/ports/vault/vault-local-repository.port.ts)                                                          | [IndexedDbVaultLocalRepositoryAdapter](../../apps/extension/src/adapters/storage/indexeddb-vault-local-repository.adapter.ts)                                                        | IndexedDB adapter backed by Dexie. It owns atomic local-vault persistence and compare-and-set behavior.                                        |
| [EncryptedUnlockedVaultSessionPayloadRepositoryPort](../../packages/core/src/ports/session/encrypted-unlocked-vault-session-payload-repository.port.ts) | [IndexedDbEncryptedUnlockedVaultSessionPayloadRepositoryAdapter](../../apps/extension/src/adapters/storage/indexeddb-encrypted-unlocked-vault-session-payload-repository.adapter.ts) | IndexedDB repository for the encrypted half of unlocked session state.                                                                         |
| [UnlockedVaultSessionMaterialRepositoryPort](../../packages/core/src/ports/session/unlocked-vault-session-material-repository.port.ts)                  | [ChromeUnlockedVaultSessionMaterialRepositoryAdapter](../../apps/extension/src/adapters/storage/chrome-unlocked-vault-session-material-repository.adapter.ts)                        | Chrome session-storage repository for volatile usable key material and session ownership.                                                      |
| [ClipboardClearTaskRepositoryPort](../../packages/core/src/ports/clipboard/clipboard-clear-task-repository.port.ts)                                     | [ChromeClipboardClearTaskRepositoryAdapter](../../apps/extension/src/adapters/storage/chrome-clipboard-clear-task-repository.adapter.ts)                                             | Chrome storage repository for clipboard-clear ownership metadata.                                                                              |
| [VaultLockTaskRepositoryPort](../../packages/core/src/ports/vault/vault-lock-task-repository.port.ts)                                                   | [ChromeVaultLockTaskRepositoryAdapter](../../apps/extension/src/adapters/storage/chrome-vault-lock-task-repository.adapter.ts)                                                       | Chrome storage repository for vault-lock ownership metadata.                                                                                   |
| [SyncProviderPort](../../packages/core/src/ports/sync/sync-provider.port.ts)                                                                            | [AwsS3SyncProviderAdapter](../../apps/extension/src/adapters/sync/aws-s3-sync-provider.adapter.ts)                                                                                   | AWS-specific provider adapter. Core continues to carry provider configuration as JSON-shaped data.                                             |
| [VaultDisplayNamePort](../../packages/core/src/ports/vault/vault-display-name.port.ts)                                                                  | [RandomVaultDisplayNameService](../../packages/core/src/services/vault/random-vault-display-name.service.ts)                                                                         | Portable core service. It uses `RandomSamplerService` and shared normalized EFF words, so it is not a browser adapter.                         |
| [BrowserLoginPort](../../packages/core/src/ports/browser-login/browser-login.port.ts) | [ChromeBrowserLoginAdapter](../../apps/extension/src/adapters/browser-login/chrome-browser-login.adapter.ts) | Extension adapter for active-page inspection and explicit fill, with tab, URL and document checks before dispatch. |
| [CapturedLoginRepositoryPort](../../packages/core/src/ports/browser-login/captured-login-repository.port.ts) | [ChromeCapturedLoginRepositoryAdapter](../../apps/extension/src/adapters/browser-login/chrome-captured-login-repository.adapter.ts) | Extension session-storage repository; encrypts captured credentials and binds them to the vault, session, tab and capture identity. |

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

`apps/extension/src/extension/composition/extension-application.ts` constructs
the application use cases, including the browser-login group. Create one application per
trusted UI context, outside React rendering, and pass the needed use cases
explicitly to callers. Construction does not activate a vault, create alarms,
contact S3, or access the clipboard. Chrome task repositories restrict their
session-storage access during construction.

`session.composition.ts` owns construction of the shared session service,
clipboard coordinator, cleanup service, clock, IDs, crypto, and task adapters.
Both the application and background alarm roots use it. Within each graph, copy,
activation, lock, and deletion use the same coordinator and session service.
The application also shares one vault repository, snapshot service, sync guard,
provider, and random sampler across the workflows that need them. Both
IndexedDB repositories receive the same database handle. The factory accepts
an explicit database handle for isolated integration tests; its default is the
existing extension database.

Background construction imports only the session graph, keeping BIP39 and S3
out of alarm construction. The background entry point still registers the
clipboard-clear and vault-lock handlers synchronously. No application instance
is shared through a global registry or a new messaging protocol.

The compile-only `core-composition-api.typecheck.ts` remains a representative
public-package contract fixture. The production factory is covered by the
extension build and integration tests. Popup and options controls remain a
separate application step; neither currently calls the full factory.

## Related documentation

- [Adapter development guide](./development.md)
- [Port and adapter standards](../standards/ports-adapters-and-runtime-validation.md)
- [Core architecture](../core/architecture.md)
- [Core security model](../core/security-model.md)
- [AWS S3 adapter setup](../aws/s3/README.md)
