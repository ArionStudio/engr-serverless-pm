# Work item 20 runtime-boundary inventory

Date: 2026-08-16

Baseline: `e6f08e16`

This is the boundary-inventory, design, and completion record required after
the Finding 28 contract inventory. The initial inventory was taken from the
merged `e6f08e16` baseline; the status and implementation evidence below record
the completed work-item checkout.

## Decision and status

Adapters own conversion from `unknown` serialized data to core domain types.
Core retains cheap identity, version, algorithm-suite, and trust checks as
defense in depth. Decoders must be strict: accepting and then omitting an unknown
field can change signed or authenticated content when an older client writes the
artifact again.

Finding 20 is **resolved**. Every required artifact family now has a concrete
adapter decoder, strict current-schema validation, a static secret-free family
error, hostile-input regressions, and an order-sensitive no-side-effect barrier.
Core keeps its existing semantic checks and now also rejects unknown provider
access outcomes defensively.

## Artifact inventory

| Required slice                                          | Implemented decoder and real adapter call site                                                                                                                                                                                             | Strictness and error                                                                                                                                                                                                                                                                | Outcome   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1. Local/remote snapshot and descriptor                 | The slice-owned `adapters/codecs/vault-snapshot.codec.ts` is called by `IndexedDbVaultLocalRepositoryAdapter` and `AwsS3SyncProviderAdapter`; both validate asymmetric keys with the shared WebCrypto validator.                           | Exact current schema, identities, vectors, counters, canonical bytes/signatures, duplicate sets, nested rollback snapshot, and requested-vault relation. Errors: `InvalidLocalVaultSnapshotRecordError` and `InvalidRemoteVaultSnapshotRecordError`.                                | Resolved. |
| 1. Opened vault key and decrypted `Vault`               | `WebCryptoAdapter.openDeviceVaultKeyEnvelope` validates the raw key length; `decryptVaultSnapshotContent` decodes authenticated JSON and validates all nested rollback keys.                                                               | Current suite lengths, exact nested vault/entry/tag/device/config shapes, established entry/tag schemas, importable keys. Errors: `InvalidOpenedVaultMasterKeyError` and `InvalidVaultSnapshotPayloadError`.                                                                        | Resolved. |
| 2. Local descriptor, access, recovery, checkpoint       | `IndexedDbVaultLocalRepositoryAdapter` implements all `VaultLocalRepositoryPort` methods over the in-place Dexie schema and calls the family codecs on every read.                                                                         | Exact wrappers/artifacts, pair identity/generation/revision, canonical salts/digests/signatures, CAS and atomic pair writes, key import. Error: `InvalidLocalVaultSecurityRecordError`.                                                                                             | Resolved. |
| 2. Unwrapped local keys                                 | `WebCryptoAdapter.unwrapLocalKeysPayload` decodes authenticated JSON before returning it.                                                                                                                                                  | Exact fields, suite-sized/importable private keys and trust anchor, no retained plaintext/cause. Error: `InvalidLocalKeysPayloadError`.                                                                                                                                             | Resolved. |
| 3. Enrollment artifacts and pending state               | `JsonTextDeviceEnrollmentTransport` parses/serializes documented copied-text/file JSON; `IndexedDbVaultLocalRepositoryAdapter` decodes pending records.                                                                                    | Version `1`, exact nested shapes, canonical bytes/signatures, duplicate identities/slots, importable request/response/snapshot keys. Error: `InvalidDeviceEnrollmentArtifactError`.                                                                                                 | Resolved. |
| 3. Enrollment private state                             | `WebCryptoAdapter.unwrapDeviceEnrollmentPrivateState` decodes authenticated JSON before the workflow continues.                                                                                                                            | Exact request/private-state shapes, suite-sized/importable private keys and signatures. Error: `InvalidDeviceEnrollmentPrivateStateError`.                                                                                                                                          | Resolved. |
| 4. Sync credential record, provider config, and outcome | `IndexedDbVaultLocalRepositoryAdapter` decodes the encrypted record; `AwsS3SyncProviderAdapter` decodes setup and stored access before client construction; both core outcome consumers use `requireSyncProviderAccessOutcome`.            | Exact AWS discriminant/config/access shapes, finite JSON, canonical encrypted bytes, only `accessible` or `authentication_rejected`. Errors: `InvalidSyncCredentialRecordError`, `InvalidSyncProviderResponseError`, and defense-in-depth `InvalidSyncProviderOutcomeError`.        | Resolved. |
| 4. Decrypted credential state                           | `WebCryptoAdapter.decryptDeviceSyncCredentialState` decodes authenticated JSON before any provider or write.                                                                                                                               | Exact current/previous credential state, supported provider, finite JSON, unique nonblank revoked IDs, safe generation. Error: `InvalidDeviceSyncCredentialStateError`.                                                                                                             | Resolved. |
| 5. Session material, identity, and epoch                | `ChromeUnlockedVaultSessionMaterialRepositoryAdapter` calls the hardened material codec and shared WebCrypto key validator; identity projection reuses the full decoder. Epoch remains separately range checked.                           | Exact nested keys, context identity, safe counters, unique devices, canonical suite-sized bytes, importable keys, failure wiping. Error: `InvalidUnlockedVaultSessionMaterialError`.                                                                                                | Resolved. |
| 5. Encrypted/decrypted session payload                  | The IndexedDB repository validates the exact wrapper and encrypted artifact; `WebCryptoAdapter.decryptUnlockedVaultSessionPayload` decodes authenticated nested `Vault` before `UnlockedVaultSessionService.restore` installs it.          | Exact wrapper/identity/vector, canonical encrypted bytes, strict nested vault; restore preserves `UnlockedVaultSessionInvalidError` with only the secret-free decoder cause. Errors: `InvalidUnlockedVaultSessionPayloadRecordError` and `InvalidUnlockedVaultSessionPayloadError`. | Resolved. |
| 5. Scheduled task and metadata records                  | `ChromeAlarmsScheduledTaskAdapter`, `ChromeClipboardClearTaskRepositoryAdapter`, and the new volatile `ChromeVaultLockTaskRepositoryAdapter` share `scheduled-task-record.codec.ts`; the background composes both clear and lock handlers. | Canonical alarm name, exact metadata, safe expiry, atomic action-matching lock removal. Error: `InvalidScheduledTaskRecordError`.                                                                                                                                                   | Resolved. |

The extension exports the concrete crypto, device transport, storage, sync, and
scheduled-task adapters. Dexie owns the current vault/session records in schema
version `1`, corrected in place under the repository's pre-release rule. The
background runtime now composes the real `lockVault` alarm path through the
existing `LockVaultUseCase` and lifecycle cleanup service.

The five decoder slices are independently reviewable modules under
`apps/extension/src/adapters/codecs/`, sharing only narrow record, number,
canonical-byte, encryption-envelope, signature, and version-vector primitives.
Owning adapter barrels re-export only their public family errors; storage no
longer exposes crypto/provider/transport codecs as a cross-domain API.

## Existing defense in depth

These checks remain required after adapters decode records:

- snapshot schema and suite checks in
  `packages/core/src/services/snapshot/vault-snapshot.service.ts`;
- trust-anchor, certificate, checkpoint, duplicate-device, generation, and
  signature checks in
  `packages/core/src/services/trust/vault-trust.service.ts`;
- enrollment request/response checks in
  `packages/core/src/use-cases/device-trust/initialize-device-enrollment.ts`
  and `perform-device-enrollment.ts`;
- device-access and recovery suite/identity checks in unlock, password change,
  and recovery.

They do not prove that nested arrays, numbers, discriminants, and byte encodings
are valid. In particular, unlock derives and unwraps keys before the snapshot
schema check in `packages/core/src/use-cases/vault-lifecycle/unlock-vault.ts`,
and enrollment unwraps pending state before checking the nested snapshot in
`packages/core/src/use-cases/device-trust/perform-device-enrollment.ts`. Outer
decoders must reject malformed envelopes before crypto.
Authenticated decryption and unwrap operations must also decode their plaintext
from `unknown` before returning a domain type; malformed plaintext necessarily
uses crypto but must fail before mutation, signing, persistence, provider calls,
clipboard action, or session activation.

## Reuse map

| Candidate                                                                          | Relevant invariant                                                                                                                          | Decision                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encodeBase64Url` / `decodeBase64Url` (`packages/core/src/lib/base64Url.utils.ts`) | The encoder emits canonical unpadded Base64URL, but the decoder deliberately accepts padded and unpadded input (`base64Url.utils.test.ts`). | Compose inside artifact codecs, then require `encodeBase64Url(decoded) === input` so persisted artifacts reject padded or otherwise noncanonical spellings. Also validate each field's byte length. Wrap failures in an artifact-specific static error without retaining the hostile record. |
| `unlocked-vault-session-material.codec.ts`                                         | Storage-safe key conversion and reconstruction are already wired to a real adapter.                                                         | Extend only for the session-material slice: strict keys, safe nonnegative integers, duplicate identities, byte lengths, and one static decoder error. Do not generalize it into a universal framework.                                                                                       |
| `VaultTrustService` and `VaultSnapshotService`                                     | Semantic trust/signature/suite checks must remain after structural decoding.                                                                | Compose after decode; reject as the structural decoder because it performs crypto.                                                                                                                                                                                                           |
| Existing Zod entry/delay schemas                                                   | Their field rules are established owners for entry inputs and configured delays.                                                            | Reuse only for those exact semantics. Do not build a universal schema layer or add adapter-local Zod without dependency approval.                                                                                                                                                            |
| `VersionVector` (`packages/core/src/domain/versioning/version-vector.type.ts`)     | Device IDs must be usable identities and counters must be nonnegative safe integers.                                                        | Add or compose a family-level validator in each concrete codec; the current type alias alone is not validation.                                                                                                                                                                              |
| Existing core workflow errors                                                      | They describe semantic failures after a valid artifact is loaded.                                                                           | Preserve them. Establish adapter/artifact decode errors separately; do not expose raw secret-bearing causes.                                                                                                                                                                                 |

## Strict decoding contract

Every implemented codec must:

1. accept `unknown` and return the current core type only after complete shape
   validation, both at the serialized envelope boundary and after authenticated
   decrypt/unwrap parsing;
2. reject missing, wrong-typed, and unknown fields;
3. reject unsupported versions before crypto, mutation, or writes;
4. reject negative, fractional, non-finite, or unsafe numeric counters and
   timestamps as applicable;
5. reject duplicate IDs in active/tombstone collections, trust devices, key
   slots, and other identity sets;
6. require canonical unpadded Base64URL by decoding each serialized branded byte
   field, checking that canonical re-encoding exactly equals the input, and
   validating its byte length before conversion, without changing
   signed/authenticated content;
7. import structurally valid asymmetric public/private key bytes in the crypto
   adapter before returning branded keys; the family codec invokes that
   crypto-owned validator and translates any import failure to its own family
   error before returning the domain record. Reject signatures that violate the
   suite-approved serialized byte shape in the family codec before signature
   verification; cryptographic signature validity remains with the existing
   core trust/snapshot workflow;
8. expose an artifact-specific static error name/message that does not keep the
   raw record or secret-bearing validation cause; and
9. round-trip valid current artifacts byte-for-byte at the serialized level.

No automatic migration, universal schema framework, AWS validation in core, or
new version identifier is part of this design.

## Decoder error ownership

Errors belong beside the concrete codec or crypto/provider decoder in the
adapter package, are named exports from that module and its adapter barrel, and
are not exported from `@lfspm/core`. Adapter methods reject with them unchanged;
only an existing workflow catch may translate them. Provider `setup` remains
translated to `InvalidSyncConfigError`; session payload restoration maps its
crypto decoder error to `UnlockedVaultSessionInvalidError`. Each decoder class
follows the current project error convention by declaring `override readonly
name` equal to its exact class name, sets the exact static message below, and
retains neither raw input nor a `cause`.

| Slice and owner                                     | Exact errors and static messages                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 local-vault storage adapter                       | `InvalidLocalVaultSnapshotRecordError`: “Local vault snapshot record is malformed.”                                                                                                                                                                                                                |
| 1 sync-provider adapter                             | `InvalidRemoteVaultSnapshotRecordError`: “Remote vault snapshot record is malformed.”                                                                                                                                                                                                              |
| 1 crypto adapter                                    | `InvalidOpenedVaultMasterKeyError`: “Opened vault master key is malformed.”; `InvalidVaultSnapshotPayloadError`: “Vault snapshot payload is malformed.”                                                                                                                                            |
| 2 local-vault storage adapter                       | `InvalidLocalVaultSecurityRecordError`: “Local vault security record is malformed.”                                                                                                                                                                                                                |
| 2 crypto adapter                                    | `InvalidLocalKeysPayloadError`: “Local keys payload is malformed.”                                                                                                                                                                                                                                 |
| 3 enrollment transport/local-vault storage adapters | `InvalidDeviceEnrollmentArtifactError`: “Device enrollment artifact is malformed.”                                                                                                                                                                                                                 |
| 3 crypto adapter                                    | `InvalidDeviceEnrollmentPrivateStateError`: “Device enrollment private state is malformed.”                                                                                                                                                                                                        |
| 4 local-vault storage adapter                       | `InvalidSyncCredentialRecordError`: “Sync credential record is malformed.”                                                                                                                                                                                                                         |
| 4 sync-provider adapter                             | `InvalidSyncProviderResponseError`: “Sync provider response is malformed.” Setup translates it through the existing workflow catch; `checkVaultAccess` propagates it and stops. Slice-1 descriptor/download decoding uses only `InvalidRemoteVaultSnapshotRecordError`.                            |
| 4 crypto adapter                                    | `InvalidDeviceSyncCredentialStateError`: “Device sync credential state is malformed.”                                                                                                                                                                                                              |
| 5 session storage adapter                           | `InvalidUnlockedVaultSessionMaterialError`: “Unlocked vault session material is malformed.”                                                                                                                                                                                                        |
| 5 IndexedDB session-payload adapter                 | `InvalidUnlockedVaultSessionPayloadRecordError`: “Unlocked vault session payload record is malformed.”                                                                                                                                                                                             |
| 5 crypto adapter                                    | `InvalidUnlockedVaultSessionPayloadError`: “Unlocked vault session payload is malformed.” `UnlockedVaultSessionService.restore` catches it at `unlocked-vault-session.service.ts` and exposes the existing `UnlockedVaultSessionInvalidError` with only this secret-free decoder error as `cause`. |
| 5 scheduled-task/metadata adapters                  | `InvalidScheduledTaskRecordError`: “Scheduled task record is malformed.”                                                                                                                                                                                                                           |

These are adapter API errors, not new core package exports. Concrete adapter
locations remain part of each required vertical slice, but their absence no
longer leaves error names, exposure, or translation to independent invention.
Every decoder test asserts the concrete class, exact `name`, exact message, and
absence of an own `cause` or retained hostile-record field.

The crypto adapter owns one reusable asymmetric-key import validator. Family
codecs receive it through adapter composition, perform canonical encoding and
length checks first, invoke it before branding a key, catch its import failure,
and throw their own table-listed family error. This keeps WebCrypto import rules
in one owner without leaking a crypto-generic error through storage, provider,
enrollment, or session APIs. Signature codecs perform only suite-owned byte-shape
validation; `VaultTrustService`/`VaultSnapshotService` retain cryptographic
verification and their existing semantic errors.

Shared classes also have one definition: `InvalidDeviceEnrollmentArtifactError`
lives beside the shared enrollment artifact codec and is re-exported by the
transport and local-storage adapter barrels; `InvalidScheduledTaskRecordError`
lives beside the shared task-record codec and is re-exported only by the task
adapter barrel. No barrel defines a second class with the same name.

## Ordered implementation and regression coverage

The slices remain ordered exactly as required:

1. **Snapshot plus descriptor.** Implement the actual local-vault and remote
   provider decoders first. Cover old/future snapshot schema, missing/wrong/extra
   fields, vectors/timestamps/generations, malformed bytes, duplicate trust and
   slot IDs, plus duplicate IDs within and across active/tombstoned entry, tag,
   and device-profile collections and exact signed round-trip. On outer shape,
   canonical-encoding, or length failure, allow only the decoder-owned key-import
   validator when its prerequisites passed; prohibit downstream decrypt, unwrap,
   sign, verify, mutation, and write calls. Also decode decrypted `Vault`
   plaintext at the crypto adapter and prove an invalid opened vault-master-key
   length prevents snapshot decryption, and malformed authenticated `Vault`
   plaintext causes no mutation, signing, upload, or write. When
   `syncRemovalPending` exists, decode
   its nested `rollbackSnapshot` with the same slice-1 snapshot codec and include
   a hostile nested-snapshot/no-side-effect regression.
2. **Device access, recovery, and checkpoint.** Reuse the chosen local repository
   serialization rules and decode unwrapped `LocalKeysPayload` at the crypto
   adapter. Cover cross-record vault/device identity, salts/keys, checkpoint
   version, exact round-trip, and zero derive/unwrap/verify/write calls on outer
   failure. Exercise round trips through initialization, password change,
   enrollment, and recovery writers as well as hostile reads; authenticated
   malformed local-key plaintext may unwrap but must cause no key-pair check,
   envelope open, snapshot decrypt, persistence, or mutation. Reject malformed,
   noncanonical, or wrong-shape checkpoint signatures before checkpoint
   signature verification. Preserve the three readers' current semantic owners
   and behavior: unlock and recovery continue their existing checkpoint
   verification/rollback checks, while credential completion retains its current
   persistence behavior. Preserve `LocalVaultTrustCheckpointNotFoundError`,
   `LocalVaultTrustCheckpointInvalidError`, and existing rollback errors where
   those paths already expose them. Decoder regressions cover malformed,
   noncanonical, and wrong-shape records/signatures plus no later crypto,
   persistence, or session mutation after structural failure. Universal
   checkpoint signer/private-key binding, a centralized verified-checkpoint
   service workflow, and fresh checkpoint replacement during credential
   completion are separately proposed Finding 28 security work. They have no
   decoder prerequisite, require a separately numbered trust/persistence unit,
   and coordinate with slice 2 only if simultaneous; they are not Finding 20
   decoder-slice closure gates.
3. **Enrollment.** Decode request/response at the real import/transport adapter
   and pending state at the real repository; decode unwrapped private state at
   the crypto adapter. Cover request/response version, nested snapshot, repeated
   identities, bytes, extras, and zero signature/derive/unwrap/write calls on
   outer failure. Authenticated malformed private state may unwrap but must
   cause no subsequent derive, signature, persistence, or activation.
4. **Sync credentials/configuration.** Decode the encrypted local record and
   validate JSON/provider discriminants at the provider adapter while keeping
   AWS semantics out of core; decode credential plaintext at the crypto adapter.
   Strictly decode `checkVaultAccess` as only `accessible` or
   `authentication_rejected`. Cover invalid JSON numbers/shapes and zero
   decrypt/provider/write calls on outer failure, plus no provider/write/mutation
   after authenticated malformed plaintext or an unknown provider outcome.
5. **Session/task records.** Strengthen material decoding, add an encrypted
   payload codec, decode its plaintext at the crypto adapter, and decode
   alarm/task metadata at the concrete Chrome adapter. Cover versions where
   already defined, strict fields, numeric ranges, duplicate IDs, byte lengths,
   context identity, static errors, no decrypt after outer failure, and no
   clipboard/session mutation after authenticated malformed plaintext. For
   scheduled events, preserve stored metadata as the current action owner and
   cover mismatched event/record `actionId` for both clipboard clear and vault
   lock with no clipboard clear, task removal, alarm cancellation, or session
   removal. Finding 21 owns the additional absent-record, vault-ID, and active
   session-generation binding; this slice coordinates with but does not pull in
   that lifecycle change. This slice decodes the current public command/event and
   stored-record shapes. Caller-supplied task metadata has already been removed,
   and the current production alarm path supplies only correlation/expiry-policy
   input; preserve that completed ownership boundary. Assert authenticated
   malformed session plaintext is thrown by the crypto adapter as
   `InvalidUnlockedVaultSessionPayloadError`, translated by restore to
   `UnlockedVaultSessionInvalidError`, retains only that secret-free error as
   `cause`, and performs no session activation/mutation. Structural decoding
   preserves the current session relation behavior for this slice; it does not
   declare payload-ahead restoration coherent. The status/epoch ownership part
   of Finding 28 T5 is already complete; only the separately reviewable
   mixed-generation payload-ahead question remains outside this decoder slice.

Each slice requires adapter hostile-record tests, focused core no-side-effect
tests, extension/core type checks, the relevant adapter/core tests, and the full
core suite. Snapshot/access/enrollment/session slices must include valid-length
but non-importable Ed25519/P-256 keys, and snapshot/enrollment records must cover
wrong-shape signatures before dependent crypto or writes. Slice 2 must apply the
same signature-shape coverage to the local trust checkpoint.

Slices 2 and 3 coordinate device-access and enrollment identity rules with
Finding 22. They strictly decode the current fields and preserve all existing
identity checks, but do not narrow, duplicate, or redesign those identities in
this work item.

## Residual rollback limit

Structural decoding proves shape, not freshness. Checkpoint signature
verification and `requireSnapshotNotRolledBack` detect malformed state and a
snapshot/checkpoint mismatch, but cannot detect hostile local storage rolling
back a valid signed snapshot together with its matching older valid signed
checkpoint. The same limitation applies to other mutually consistent older
record sets: an older session-material/encrypted-payload pair can pass current
matching/decryption and expose an older vault, while older access/recovery state
can remain structurally valid decoder output. These states need a
platform-protected monotonic counter, remote freshness witness, or another
trusted authority to distinguish them from current state.

This complete-coordinated-rollback limitation is not changed by work item 20 and
must not be described as closed by the five decoder slices. Security regression
documentation includes both a matching older snapshot/checkpoint pair and a
matching older session material/payload pair, while noting that all-local-record
rollback remains possible. Selecting an external freshness authority is a
separate architecture/security decision, not permission to pull another work
item's anti-rollback design into this unit.

## Implemented standards and resolved prerequisites

There is no remaining work-item blocker. The user approved the missing S3 and
canonical-JSON dependencies. The implementation uses the repository's documented
AWS S3 provider and `${prefix}vault.enc` object contract, `@aws-sdk/client-s3`,
RFC 8785 JSON Canonicalization through the usable exact
`json-canonicalize@2.0.0` release, WebCrypto AES-GCM/PBKDF2/HKDF, Ed25519 raw
public plus PKCS8 private keys, and P-256 uncompressed raw public plus PKCS8
private keys. HKDF purposes and authenticated contexts remain bound to the
current vault/device/generation/suite owners.

Enrollment uses strict version-1 JSON text because the repository design already
specifies files or copied text. No legacy branch, schema-version bump, universal
schema framework, AWS rule in core, or unrelated work item was introduced.
