# Core domain model

Status: current implementation

The core model separates encrypted persisted artifacts, plaintext unlocked
state, local device access records, and remote sync state. This page describes
the TypeScript contracts. Exported types and extension codecs define the
implemented serialized shapes. The
[v1 security specification](../security/security-specification.md) is a legacy,
non-normative design reference.

## Vault

`Vault` is the plaintext payload that exists inside an unlocked session and
inside encrypted snapshot content. It contains:

- active password entries and deletion tombstones;
- active tags and deletion tombstones;
- active device profiles and deletion tombstones;
- the vault-level version vector;
- an optional provider-neutral sync target;
- temporary state for sync removal and provider-credential revocation.

Entries, tags, and device profiles carry their own version vectors. Tombstones
retain identity, version, and deletion time so devices can reconcile removals
instead of recreating deleted values.

### Password entries

`PasswordEntry` contains the entry identifier, login, password, sanitized URL,
tag identifiers, and version vector. Read and search workflows return
`VisiblePasswordEntryFields`, which excludes the password. The password is
available only through `GetEntryPasswordUseCase` and workflows that explicitly
need the secret.

### Version vectors

A `VersionVector` maps device IDs to counters. Core uses it at vault, entry,
tag, and device-profile level. Snapshot comparison returns `equal`,
`local_ahead`, `remote_ahead`, or `broken`. In
`PrepareSyncReviewUseCase`, a missing remote snapshot is reported as
`RemoteVaultSnapshotNotFoundError`; setup, upload reconciliation, and sync
removal apply their own signed-expectation rules. Verified `remote_ahead`
snapshots can produce item-level review. Crossed vectors are `broken` and fail
as unsupported concurrency or an integrity error; core does not merge
concurrent branches.

## Signed vault snapshot

`VaultSnapshot` is the portable persisted and synchronized artifact. It
contains:

- metadata identifying the snapshot, schema, algorithm suite, creating device,
  vault creation and revision timestamps, snapshot version vector, vault-key
  generation, and optional signed expected remote snapshot identity;
- the device trust certificate chain;
- one vault-key envelope for each device that can open the current vault key;
- encrypted vault content;
- a device signature over the unsigned snapshot.

`VaultSnapshotIdentity` pairs a descriptor with a digest. Remote operations and
review/apply workflows use the full identity to authorize replacement or
deletion; a descriptor alone is insufficient. Local snapshot persistence uses
the expected digest together with the exact signed checkpoint as its atomic
compare-and-swap boundary. Every synchronized snapshot transition also compares
the exact encrypted credential state, even when retaining that artifact
byte-for-byte.

The snapshot version vector and the vault-content version vector have separate owners. Persisting a trust-only change advances the snapshot vector while content can stay unchanged. Enrollment and reconnection must preserve both values; they must not require the two vectors to be equal.

## Device trust

Each trusted device has a stable device ID, a public signing key, and a public
vault-exchange key. `VaultTrustChain` records signed enrollment and revocation
generations. A local `LocalVaultTrustAnchor` pins the genesis identity, and a
persisted checkpoint records the newest accepted trust and snapshot state
available to the current operation. It cannot reveal a coordinated restoration
of every local record without an independent freshness source.

Enrollment uses two transferred artifacts:

- a request produced on the target device, with public keys and signed request
  identity;
- a response produced by an already trusted device, with the trust anchor and
  a snapshot containing a key envelope for the target.

Revocation advances trust state and vault-key generation. Surviving devices
consume that transition before they can continue normal synchronized writes.

## Local device access

The local repository stores several records with different purposes:

| Record                               | Purpose                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `LocalVaultDescriptor`               | Lists a local vault without opening it                                                   |
| `DeviceAccessMaterial`               | Protects private device keys with the master-password-derived local protection hierarchy |
| `DeviceAccessRecoveryBackup`         | Protects replacement access to the same device identity with the recovery key            |
| `LocalVaultTrustCheckpoint`          | Pins the newest locally accepted trust and snapshot state                                |
| `EncryptedDeviceSyncCredentialState` | Protects provider credentials with the device-local protection key                       |

The access material and recovery backup share a local generation identifier.
Core saves them with revision and generation expectations so a stale operation
cannot overwrite a newer pair.

## Unlocked session

An unlocked session is split into two records:

- `UnlockedVaultSessionMaterial` holds the session ID, vault and device IDs,
  source version vector, private keys, vault key, device-local protection key,
  payload key, trust context, and local trust anchor. The device-local key opens
  encrypted provider credentials;
- `EncryptedUnlockedVaultSessionPayload` holds the vault encrypted with the
  session payload key.

Core treats both records as one session. Reads verify that their IDs, vault,
and version relationship are valid: the session and vault IDs must match, and
the encrypted payload's source version may equal or advance the material's
version but must never be older or divergent. The device ID belongs to the
session material. Writes use session ownership checks so an older operation
cannot replace a newer active session.

## Sync state

The vault stores a provider-neutral `SyncTarget`. Each device separately stores
its encrypted `DeviceSyncCredentialState`, which contains current credentials
and may also track an expected upload or previous credentials awaiting external
revocation.

This split keeps cloud credentials out of synchronized vault content. It also
lets credential rotation finish per device after the shared vault records a
revocation transition.

## Scheduled actions

Core models two scheduled task kinds: `lockVault` and `clearClipboard`. Each task
has an `actionId`. Repositories and runtime handlers use that ID to prove that a
callback still owns the action before it changes session or clipboard state.

## Source contracts

- `packages/core/src/domain/vault/vault.ts`
- `packages/core/src/domain/snapshot/vault-snapshot.ts`
- `packages/core/src/domain/device-trust`
- `packages/core/src/domain/session`
- `packages/core/src/domain/sync`
- `packages/core/src/domain/versioning`
