# Report nr 6 — Secure Device Revocation

## Purpose

This report records the resolution of finding 5 from the core security review:
revocation previously removed a device slot without rotating the vault master
key or provider credential. It also includes finding 6 because a safe revocation
is incomplete unless surviving devices have a dedicated, verified way to accept
the rotated snapshot.

## Problem

Removing an old device slot does not revoke a device that already cached the
vault master key. That device can continue decrypting every later snapshot
encrypted with the same key. If it also retains the shared S3 credential, it can
continue reading, deleting, or replacing remote objects.

The former symmetric slot model could not let one trusted device distribute a
fresh vault key to offline survivors. Re-enrolling every survivor would be
operationally expensive, while requiring simultaneous connections would violate
the project's local-only design.

## Before and after

The change is not only “remove the device from a list.” It replaces the way
devices receive the vault master key and the way trust changes are accepted.

| Concern                       | Before                                                                                                          | After                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Device cryptographic identity | One Ed25519 pair was responsible for signing.                                                                   | Ed25519 remains responsible for signing, while a separate ECDH P-256 pair receives vault-key envelopes.                                  |
| Device key slot               | A symmetric slot could not safely deliver a fresh key to an offline survivor.                                   | Every trusted device has one recipient-specific envelope that only its private wrapping key can open.                                    |
| Revocation                    | Removing a slot did not invalidate a vault key already cached by the removed device.                            | Revocation creates a fresh vault master key, increments its signed generation, and creates envelopes only for survivors.                 |
| Trust evidence                | The trust chain identified trusted devices, but did not cryptographically bind every removal to a key rotation. | Every trust certificate includes `vaultKeyGeneration`; each revocation must increment it exactly once.                                   |
| Provider configuration        | Target and secret credential could travel together in shared vault state.                                       | The shared vault contains only `SyncTarget`; encrypted credentials remain local to each device.                                          |
| Offline survivors             | Only an immediately following revocation could be consumed safely.                                              | A survivor can verify a complete suffix of supported enrollments and revocations before opening the final envelope.                      |
| Later content changes         | A trust change combined with later content could strand a survivor.                                             | Mandatory trust changes are applied first; ordinary entries, tags, and surviving profiles use the normal prepare/review/apply sync flow. |
| Pending enrollment            | A response could become stale after unrelated trust changes.                                                    | A matching, still-trusted request can receive the current signed snapshot without another trust transition.                              |
| Failed enrollment activation  | Initialized local records could remain after session activation failed.                                         | Enrollment removes only the records it just created and keeps the pending request retryable.                                             |

The key-distribution change can be visualized as:

```text
BEFORE

one vault master key ───────► shared symmetric device-slot mechanism
          │
          └── revoked device may already have cached this same key
                                  │
                                  └── removing its slot is not cryptographic revocation

AFTER

fresh vault master key, generation N+1
          │
          ├── ECDH envelope for survivor A ──► only A's private vault key opens it
          ├── ECDH envelope for survivor B ──► only B's private vault key opens it
          └── no envelope for revoked C ─────► C cannot obtain generation N+1
```

## Implemented design

Every device now has two separate key pairs:

- Ed25519 for signatures;
- ECDH P-256 for vault-key envelopes.

Both public keys are authenticated by the signed trust chain. Private keys stay
encrypted on their owning device and in that device's recovery backup.

Each snapshot records a vault-key generation and exactly one recipient-specific
envelope for every trusted device. Each envelope uses a fresh ephemeral ECDH key,
HKDF-SHA-256, and AES-256-GCM. Its authenticated context binds the vault ID,
recipient device ID, generation, and `spm-v1` algorithm suite.

Revocation now:

1. requires exact agreement between the current local and remote snapshots;
2. validates replacement provider credentials for the existing target;
3. stages the replacement while retaining the old credential locally;
4. creates a fresh vault master key and increments its generation once;
5. removes only the target identity and profile;
6. creates a fresh envelope for every survivor and none for the target;
7. re-encrypts and signs the vault;
8. atomically persists the snapshot, checkpoint, and staged local credentials,
   then uploads using remote compare-and-set;
9. commits the new session key only after upload succeeds.

Persistence or upload failure restores the previous snapshot, credential, and
session. If the upload succeeds but the final session commit fails, the session
is invalidated so a later unlock cannot continue using stale key material.

## Detailed lifecycle

### Vault creation and unlock

Vault creation generates four independent local secrets:

1. the Ed25519 private signing key;
2. the ECDH P-256 private vault-wrapping key;
3. the device-local credential-protection key;
4. the initial vault master key.

The matching signing and wrapping public keys become the genesis device's
signed trust identity. The first snapshot uses vault-key generation `1` and
contains one envelope for the genesis device. The three device-owned private
keys and the local trust anchor are wrapped into `LocalKeysPayload`; the same
complete payload is protected by the existing recovery-backup flow.

Unlock unwraps this payload, verifies both private/public key pairs, verifies
the trust chain and snapshot signature, locates exactly one current-generation
envelope for the local device, and opens it with the local ECDH private key.
Only then can it decrypt the vault content and activate an unlocked session.

```text
master password
      │
      ▼
unwrap LocalKeysPayload
      │
      ├── verify Ed25519 private key  ──► signed trust identity
      ├── verify ECDH private key     ──► signed trust identity
      └── verify local trust anchor   ──► trust-chain genesis
                                               │
                                               ▼
                              locate this device's generation-N envelope
                                               │
                                               ▼
                                  recover generation-N vault master key
                                               │
                                               ▼
                                      verify and decrypt snapshot
```

### Offline enrollment exchange

The target device now creates its own private keys. Only a signed public request
moves to an already registered device:

```text
TARGET DEVICE                     REGISTERED DEVICE

generate signing pair
generate wrapping pair
generate local-protection key
store private request state
       │
       └── public signed request ─────────────► verify self-signature
                                                add public identity to trust
                                                create current-key envelope
       ◄──────── enrollment response ────────── sign/upload current snapshot
verify trust, signer, slot
open envelope locally
enter S3 credential locally
complete enrollment
```

The response contains the request ID, trust anchor, and encrypted signed
snapshot. It contains no private key and no provider credential. The devices do
not need to be online simultaneously.

If unrelated trust changes make the response stale before completion, the
registered device can refresh it. Refresh is read-only: the request must match
the currently trusted device ID and both public keys, and the current snapshot
must contain exactly one valid envelope for that identity. A historically
revoked identity cannot be refreshed or resurrected.

### Direct device revocation

The initiating device performs the security-sensitive work in this order:

```text
verify local session and exact remote descriptor
                     │
                     ▼
validate replacement credential and unchanged S3 target
                     │
                     ▼
stage replacement credential; retain old credential locally
                     │
                     ▼
validate target trust identity, slot, and profile state
                     │
                     ▼
generate fresh vault master key; generation N ──► N+1
                     │
                     ▼
append signed removal certificate
                     │
                     ▼
create one N+1 envelope per survivor; none for target
                     │
                     ▼
re-encrypt, sign, persist with CAS, upload with remote CAS
                     │
                     ▼
commit N+1 key into session only after successful upload
```

The old local credential is deliberately retained in encrypted pending state.
Core cannot declare provider access revoked merely because a new credential
works.

### Offline survivor consumption

A survivor may return after several supported trust changes. Preparation is
read-only. It downloads the latest snapshot and verifies every certificate
after the survivor's local checkpoint. Enrollments must add exactly one new
identity without changing the vault-key generation. Revocations must remove
exactly one identity and increment the generation exactly once. Existing public
keys cannot change, removed identities and keys cannot be reused, and the local
device must survive the complete suffix.

After trust validation, the survivor opens only its final-generation envelope.
It constructs mandatory device-profile state for the verified trust changes,
then sends later ordinary entry, tag, and surviving-profile changes through the
existing sync review.

```text
local trusted snapshot                         latest remote snapshot
          │                                              │
          └──────────── compare trust suffix ─────────────┘
                                 │
                 verify each enrollment/revocation
                                 │
                 open final local-device envelope
                                 │
                 build mandatory trust/profile baseline
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
       no later content changes          later content changes
                │                                 │
       persist verified remote           present normal sync review
                                                  │
                                          apply chosen resolution
                                                  │
                                          sign and CAS-upload result
```

Apply repeats the download, descriptor, trust, envelope, and content checks so
the reviewed object cannot be replaced between preparation and persistence.
Revocation and enrollment effects are mandatory and cannot be undone through a
user-selected content resolution.

### Surviving-device enrollment consumption

Existing devices also need a safe path to accept enrollment transitions made
while they were offline. The dedicated enrollment-consumption prepare/apply
flow accepts only an addition-only trust suffix:

- existing identities and their envelopes remain unchanged;
- the vault-key generation remains unchanged;
- every added identity has one matching current-generation slot;
- a newly enrolled device may have its required active profile, while a pending
  identity may temporarily have no profile;
- later ordinary content changes still use normal sync review.

This is separate from generic sync so generic content resolution never silently
authorizes a new public key.

### Failure and concurrency handling

Local snapshots, checkpoints, and encrypted credential records use the existing
atomic repository boundary and expected-current-state checks. Remote uploads
use descriptor compare-and-set. The important outcomes are:

| Failure point                                   | Result                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Credential validation                           | Nothing is staged or persisted.                                                               |
| Local persistence before upload                 | The previous snapshot, checkpoint, credential state, and session remain usable.               |
| Remote compare-and-set rejection                | The operation becomes a sync conflict; it does not overwrite a newer remote snapshot.         |
| Upload failure                                  | Local snapshot, checkpoint, and credentials are restored.                                     |
| Upload succeeds but session commit fails        | New local state is retained and the stale session is invalidated.                             |
| Enrollment activation fails                     | Only newly initialized enrollment records are removed; the pending request remains retryable. |
| Enrollment rollback races with newer local work | Cleanup is conditional and refuses to remove newer state.                                     |

## Follow-up review findings

Generic sync still rejects all trust, generation, and key-slot changes. A new
dedicated prepare/apply workflow now accepts a newer snapshot only when every
certificate after the survivor's local trust point proves one supported trust
transition:

- enrollment certificates add exactly one identity and preserve the key
  generation;
- revocation certificates remove exactly one identity and advance the signed
  vault-key generation exactly once;
- all survivor signing and wrapping public keys are unchanged;
- a historically removed device ID or public key is never added again;
- every final survivor has exactly one fresh current-generation envelope;
- all revoked profiles and slots were removed consistently;
- the final snapshot is causally ahead and retains the vault creation time.

This resolves the first follow-up finding: an offline survivor can skip multiple
consecutive trust changes, including enrollments between revocations. The
prepared result reports both added and removed identities. Its encrypted
credential state records every removed device ID but retains only the previous
credential that this survivor actually possessed.

The second finding was that later ordinary content changes could strand the
survivor. Preparation now builds the mandatory revoked-profile baseline, then
uses the existing entry, tag, and device-profile review model for later changes.
Revocations never appear as selectable resolutions. Apply verifies the current
remote object again and either stores it directly when there are no later
changes or uploads a normal resolved snapshot with the final trust, generation,
slots, and rotated key.

The third finding concerned pending enrollment. A request whose identity and
both public keys are already current can receive a refreshed response containing
the latest signed snapshot without a new certificate, write, or upload. A
previously revoked device ID is rejected. Enrollment completion also removes
newly initialized local vault records if session activation fails while keeping
the pending request retryable.

A later review found two remaining enrollment lifecycle gaps. Existing
survivors could detect an enrollment trust transition but had no verified path
to consume it. They now use a dedicated prepare/apply workflow that accepts
only addition-only trust suffixes with an unchanged vault-key generation,
unchanged existing envelopes, and matching new identities and slots. Any later
content remains subject to normal sync review. The newly enrolled identity's
active profile is mandatory state, while an identity whose enrollment is still
pending may have no profile.

The same review found that retained pending state could replay completion over
an already initialized local vault. Completion now rejects when the vault
descriptor or access material already exists without replacing it, and the
atomic initialization repository contract is create-only. Pending request state
remains available when a prior activation cleanup failed before the recovery
mnemonic was delivered.
Newer local vault records and their recovery material are therefore never
replaced by a stale enrollment response.

If a definitive remote compare-and-set rejection occurs after local
initialization, rollback removes the active session and local vault records
only while the session version and persisted snapshot digest still identify
that enrollment state. Newer local state is preserved. A failed or refused
cleanup is reported as an incomplete rollback with the remote-change error
retained as its cause; it is not reported as a normal retryable rejection.
If that same enrollment session already advanced through a later successful
upload, enrollment completes and delivers the recovery mnemonic instead of
rolling valid state back. Rollback for one vault never invalidates another
vault's active session.

The survivor enters the latest replacement S3 credential once and opens the
final envelope with its existing private wrapping key. It does not need
re-enrollment or a simultaneous connection to the revoking device.

Revocation initiation also validates the target's profile state before provider
credential checks or key rotation. A target may have one active profile or no
profile yet while enrollment is pending; an existing tombstone, duplicate
active profile, or simultaneous active and deleted state is rejected so the
initiator cannot publish a snapshot that survivors must later reject.
The same invariant is checked for every identity during enrollment and
revocation consumption: trusted identities may be active or pending but never
tombstoned, untrusted identities may not remain active, and duplicate profile
or tombstone records are rejected rather than hidden by sync review. A
tombstone is valid only for a device ID present in signed trust-chain history.
Generic sync applies the same checks to local, downloaded, and resolved vault
state before it can present or persist ordinary profile changes.

## Sync credential boundary

The shared encrypted vault stores only the non-secret sync target. Credentials
exist only as context-bound encrypted local records. Enrollment requests,
enrollment responses, and shared snapshots contain no provider credentials.

During credential rotation, local state may contain both the replacement
credential and the encrypted previous credential. New enrollment, another
revocation, and sync removal cannot bypass this pending state.

## External AWS action

Core cannot create, disable, or delete IAM credentials because the project has
no privileged server or AWS control-plane authority. The user must:

1. create a replacement credential in AWS;
2. enter it while revoking the device;
3. allow the rotated snapshot to upload;
4. disable or delete the old credential in AWS;
5. run verification in the app;
6. enter the replacement credential once on each survivor.

Core reports provider revocation as complete only after access with the old
credential returns authentication rejection. Network errors, rate limits, and
indeterminate failures keep the operation pending.

## Where the implementation lives

The main ownership boundaries are:

| Responsibility                                     | Core location                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Algorithm suite and authenticated context          | [`algorithm-suite.const.ts`](../../packages/core/src/domain/crypto/algorithm-suite.const.ts)                                                                                                                                                                                                                                                                        |
| Signing/wrapping identities and signed generations | [`vault-trust.ts`](../../packages/core/src/domain/device-trust/vault-trust.ts)                                                                                                                                                                                                                                                                                      |
| Enrollment request, private state, and response    | [`device-enrollment.ts`](../../packages/core/src/domain/device-trust/device-enrollment.ts)                                                                                                                                                                                                                                                                          |
| Vault-key envelope and device-slot model           | [`key-slot.ts`](../../packages/core/src/domain/snapshot/key-slot.ts)                                                                                                                                                                                                                                                                                                |
| Snapshot metadata and current generation           | [`vault-snapshot.ts`](../../packages/core/src/domain/snapshot/vault-snapshot.ts)                                                                                                                                                                                                                                                                                    |
| Public crypto operations                           | [`crypto.port.ts`](../../packages/core/src/ports/crypto/crypto.port.ts)                                                                                                                                                                                                                                                                                             |
| Shared target and local credential boundary        | [`sync-config.type.ts`](../../packages/core/src/domain/sync/sync-config.type.ts) and [`device-sync-credential-state.ts`](../../packages/core/src/domain/sync/device-sync-credential-state.ts)                                                                                                                                                                       |
| Trust-chain and generation verification            | [`vault-trust.service.ts`](../../packages/core/src/services/trust/vault-trust.service.ts)                                                                                                                                                                                                                                                                           |
| Direct revocation                                  | [`revoke-device.ts`](../../packages/core/src/use-cases/device-trust/revoke-device.ts)                                                                                                                                                                                                                                                                               |
| Revocation suffix verification                     | [`device-revocation-consumption.service.ts`](../../packages/core/src/services/trust/device-revocation-consumption.service.ts)                                                                                                                                                                                                                                       |
| Revocation prepare/apply workflow                  | [`prepare-device-revocation-consumption.ts`](../../packages/core/src/use-cases/device-trust/prepare-device-revocation-consumption.ts) and [`consume-device-revocation.ts`](../../packages/core/src/use-cases/device-trust/consume-device-revocation.ts)                                                                                                             |
| Enrollment suffix verification                     | [`device-enrollment-consumption.service.ts`](../../packages/core/src/services/trust/device-enrollment-consumption.service.ts)                                                                                                                                                                                                                                       |
| Enrollment prepare/apply workflow                  | [`prepare-device-enrollment-consumption.ts`](../../packages/core/src/use-cases/device-trust/prepare-device-enrollment-consumption.ts) and [`consume-device-enrollment.ts`](../../packages/core/src/use-cases/device-trust/consume-device-enrollment.ts)                                                                                                             |
| Target-created enrollment                          | [`create-device-enrollment-request.ts`](../../packages/core/src/use-cases/device-trust/create-device-enrollment-request.ts), [`initialize-device-enrollment.ts`](../../packages/core/src/use-cases/device-trust/initialize-device-enrollment.ts), and [`perform-device-enrollment.ts`](../../packages/core/src/use-cases/device-trust/perform-device-enrollment.ts) |
| Ordinary content review after trust consumption    | [`prepare-sync-review.ts`](../../packages/core/src/use-cases/sync/prepare-sync-review.ts) and [`apply-sync-resolution.ts`](../../packages/core/src/use-cases/sync/apply-sync-resolution.ts)                                                                                                                                                                         |
| External old-credential verification               | [`complete-provider-credential-revocation.ts`](../../packages/core/src/use-cases/sync/complete-provider-credential-revocation.ts)                                                                                                                                                                                                                                   |

## Guarantees

After a successful revocation:

- the revoked device's cached old vault key cannot decrypt future snapshots;
- it has no current-generation envelope;
- every survivor can recover the new key with its existing private wrapping key;
- survivors require neither re-enrollment nor simultaneous connectivity;
- shared snapshots contain no provider credential;
- old provider access is never claimed revoked before rejection is verified;
- trust and key-slot changes are consumed only by a verified dedicated flow.

## Limitations

The system cannot remotely erase old local snapshots, cached keys, or plaintext
already obtained by the revoked device. Provider access also remains possible
until the user disables the old credential in AWS. These are explicit
limitations of decentralised ownership without an external trusted service.

The implementation corrects the unreleased schema in place: snapshot
`schemaVersion` remains `1`, the suite remains `spm-v1`, and no compatibility or
migration branch is included.
