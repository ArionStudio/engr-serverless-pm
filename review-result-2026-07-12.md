# `packages/core` Full Review — 2026-07-12

Scope: every tracked file under `packages/core` at commit
`50e60bb8c8006d1445121e19e1144d7690ad4eb2` on branch
`feat/recovery-device-access-backup`.

The baseline worktree was clean. This review changed no production code or tests;
this report is the only created file.

## Findings

### Blocking

1. **The device-enrollment bundle is a complete, unprotected bearer credential.**
   [packages/core/src/domain/device-trust/device-enrollment-bundle.ts:10](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/device-trust/device-enrollment-bundle.ts#L10),
   [packages/core/src/use-cases/device-trust/initialize-device-enrollment.ts:260](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/initialize-device-enrollment.ts#L260),
   [packages/core/src/use-cases/device-trust/perform-device-enrollment.ts:252](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/perform-device-enrollment.ts#L252)

   The one returned object contains normalized `syncConfig`, the secret that
   unwraps the vault master key, and the pending device's raw private signing
   key. `PerformDeviceEnrollmentUseCase` decrypts the existing vault with that
   secret; its `masterPassword` is used only later to protect new local material,
   not to authenticate access to the vault. Anyone who intercepts the object can
   access cloud storage, decrypt every credential, and complete enrollment under
   an attacker-selected local password.

   Generate the private identity on the target device, separate the one-time
   secret from the transported package, and protect/version/validate the package
   at runtime. Sync credentials should remain inside encrypted vault content.

2. **Snapshot authenticity and freshness are anchored in attacker-controlled
   snapshots.**
   [packages/core/src/use-cases/vault-lifecycle/unlock-vault.ts:119](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/unlock-vault.ts#L119),
   [packages/core/src/use-cases/device-trust/recover-device-access.ts:107](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/recover-device-access.ts#L107),
   [packages/core/src/services/snapshot/vault-snapshot.service.ts:212](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/snapshot/vault-snapshot.service.ts#L212)

   Unlock and recovery select the signer key from the candidate snapshot.
   `requireCurrentSnapshotForUnlockedVault` goes further and passes the candidate
   snapshot as its own trust source. A hostile IndexedDB writer can retain the
   legitimate ciphertext and current-device slot, add/remove trust slots, set an
   attacker signer, and sign the candidate with that attacker's key. The victim
   can still decrypt through the preserved current slot; the next legitimate
   mutation preserves and signs the attacker-controlled trust state.

   Independently, no trusted high-water mark is checked at unlock. An older,
   legitimately signed snapshot can be replayed after lock/restart, restoring
   deleted passwords or revoked slots. The volatile session vector protects only
   the current process lifetime.

   Never use a candidate as its own trust source. Anchor local signer/trust state
   to protected device identity or a verified trust-transition chain, and add a
   real anti-rollback source (remote CAS, platform-protected monotonic state, or
   an explicit degraded/offline warning). Add self-signed substitution and old
   valid snapshot tests.

3. **Session commits are not generation-bound and can resurrect a vault after
   lock.**
   [packages/core/src/services/session/unlocked-vault-session.service.ts:72](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/session/unlocked-vault-session.service.ts#L72),
   [packages/core/src/services/session/unlocked-vault-session.service.ts:105](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/session/unlocked-vault-session.service.ts#L105),
   [packages/core/src/services/session/unlocked-vault-session.service.ts:142](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/session/unlocked-vault-session.service.ts#L142)

   `requireUnlockedVaultContext` returns no session ID/generation, and
   `commitPersistedSnapshot` eventually calls the same `save` path used for a new
   activation. If a mutation reads an unlocked session, the user locks while
   encryption/upload is pending, and the mutation resumes, `save` sees no active
   material and creates a fresh session with no lock timer. Two concurrent
   activations/commits can also interleave the split payload/material writes and
   leave mismatched session IDs/keys or activate two vaults.

   Separate `activate` from `update`; return a session generation with every
   context; make update, commit, and remove conditional on that same generation;
   and serialize or atomically CAS the split records. Test deferred
   mutation/lock/resume and controlled concurrent writes.

4. **Snapshot check-and-save is non-atomic, allowing silent lost password
   updates.**
   [packages/core/src/services/snapshot/vault-snapshot.service.ts:65](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/snapshot/vault-snapshot.service.ts#L65),
   [packages/core/src/services/snapshot/vault-snapshot.service.ts:112](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/snapshot/vault-snapshot.service.ts#L112),
   [packages/core/src/ports/vault/vault-local-repository.port.ts:51](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/ports/vault/vault-local-repository.port.ts#L51)

   Two concurrent mutations can both read and validate snapshot v1, produce
   different v2 snapshots, overwrite one another through unconditional
   `saveVaultSnapshot`, and commit sessions in the opposite order. Disk and
   session can then contain different plaintext vaults with the same version
   vector, so later equality checks pass and one update is silently lost.

   Add atomic `saveVaultSnapshot(expectedDescriptor, nextSnapshot)` semantics or
   a per-vault transaction/mutex spanning validation and save. The session handoff
   must also be generation-bound. Add a test that forces both validations before
   either save.

5. **Device revocation does not rotate the vault master key or provider
   credentials.**
   [packages/core/src/use-cases/device-trust/revoke-device.ts:152](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/revoke-device.ts#L152),
   [packages/core/src/use-cases/device-trust/revoke-device.ts:161](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/revoke-device.ts#L161)

   The code removes one slot but encrypts the next snapshot with the existing
   `unlockedVault.vaultMasterKey`. A revoked device that cached that key can
   decrypt all future snapshots. It also retains the shared cloud credentials
   and can continue reading, deleting, or replacing remote objects directly.

   Revocation must generate a new vault key, re-encrypt content, re-slot only
   remaining devices, and coordinate provider-credential rotation. The current
   symmetric `DeviceSlotKey` model does not let one device re-wrap a new key for
   other devices, so this requires an architectural key-distribution redesign,
   not a local filter change.

6. **Surviving devices cannot consume a remote revocation.**
   [packages/core/src/use-cases/sync/apply-sync-resolution.ts:227](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/sync/apply-sync-resolution.ts#L227),
   [packages/core/src/use-cases/device-trust/index.ts:1](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/index.ts#L1)

   Generic resolution rejects every key-slot delta except one exact completed
   enrollment transition. There is no accept/reconcile-revocation use case. After
   device A revokes B, every other surviving device sees a removed slot and is
   permanently blocked by `SyncTrustChangeRequiresDeviceTrustFlowError`.

   Add a dedicated, verified revocation-consumption flow, or narrowly accept a
   signed slot removal only when it is paired with the matching device-profile
   tombstone, new vault-key state, and required credential rotation.

7. **Strict synchronized mode permits another mutation while the local snapshot
   is not confirmed on the remote.**
   [packages/core/src/services/sync/vault-sync-guard.service.ts:104](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/sync/vault-sync-guard.service.ts#L104),
   [packages/core/src/use-cases/vault-entries/add-entry.ts:71](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-entries/add-entry.ts#L71)

   The original finding treated the absence of offline writes and divergent
   branch merging as defects. That conclusion is rejected after clarification
   of the product contract. The vault has two intentional modes: unrestricted
   offline use when sync is disabled, and online, one-user, one-active-device-at-
   a-time use when sync is enabled. In synchronized mode, every mutation must
   start from an exact local/remote match and must be uploaded before it is
   considered committed. Crossed vectors therefore represent unsupported
   concurrency or an integrity failure, not a normal merge case.

   The verified implementation gap is narrower. `prepareLocalMutation` rejects
   `remote_ahead`, `broken`, and unequal descriptors with equal vectors, but it
   accepts `local_ahead`. A local-ahead snapshot can remain after a crash or an
   uncertain upload result. Allowing another mutation at that point extends and
   uploads state that was never first confirmed as synchronized, violating the
   strict synchronized-mode invariant.

   Before accepting a new mutation, reconcile or upload the pending local-ahead
   snapshot and then require exact descriptor equality, or reject with a focused
   synchronization-required error. Do not add offline mutation, divergent merge,
   or `local_only` conflict machinery as part of this finding. Outcome-unknown
   upload reconciliation remains finding 17.

8. **Choosing local absence for a remote-only item discards deletion causality.**
   [packages/core/src/domain/sync/entry-resolution.utils.ts:124](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/sync/entry-resolution.utils.ts#L124),
   [packages/core/src/domain/sync/tag-resolution.utils.ts:119](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/sync/tag-resolution.utils.ts#L119),
   [packages/core/src/domain/sync/device-profile-resolution.utils.ts:136](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/sync/device-profile-resolution.utils.ts#L136)

   `use_local` is accepted for `remote_only`. Because the selected local state is
   `missing`, resolution emits neither the remote value nor a tombstone. The item
   can resurrect on another device, and the current review logic then treats the
   retained local-only copy as broken.

   Until resolution can synthesize a merged, incremented tombstone with a
   deletion timestamp, reject `use_local` for `remote_only`. Preserve and stamp
   existing remote tombstones.

9. **Disabling sync can delete concurrent remote work and leave local/cloud state
   partially committed.**
   [packages/core/src/use-cases/sync/disable-sync.ts:70](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/sync/disable-sync.ts#L70),
   [packages/core/src/use-cases/sync/disable-sync.ts:102](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/sync/disable-sync.ts#L102),
   [packages/core/src/use-cases/sync/disable-sync.ts:107](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/sync/disable-sync.ts#L107),
   [packages/core/src/ports/sync/sync-provider.port.ts:26](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/ports/sync/sync-provider.port.ts#L26)

   The use case reads a descriptor and later calls an unconditional remote delete;
   the port has no expected-descriptor/CAS parameter. A concurrent upload after
   preflight can therefore be deleted. Remote deletion also happens before
   fallible local persistence, so a local failure leaves the cloud copy gone
   while the local vault still says sync is enabled. The existing failure test
   explicitly accepts this partial state.

   Make deletion conditional on the reviewed remote generation and represent
   disable as a resumable saga/state transition. Do not perform irreversible
   remote deletion before fallible local state is recoverably committed.

10. **Non-password use cases return stored plaintext passwords and sync
    credentials.**
    [packages/core/src/use-cases/vault-lifecycle/unlock-vault.ts:33](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/unlock-vault.ts#L33),
    [packages/core/src/use-cases/device-trust/perform-device-enrollment.ts:53](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/perform-device-enrollment.ts#L53),
    [packages/core/src/use-cases/device-trust/revoke-device.ts:29](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/revoke-device.ts#L29),
    [packages/core/src/use-cases/sync/prepare-sync-review.ts:38](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/sync/prepare-sync-review.ts#L38),
    [packages/core/src/domain/sync/entry-review.type.ts:10](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/sync/entry-review.type.ts#L10)

    Unlock, completed enrollment, and revocation return the full decrypted
    `Vault`. Sync review returns full local and remote `PasswordEntry` objects.
    This bypasses the deliberate Read/Search/GetPassword boundary and encourages
    all credentials and provider secrets to enter UI state, logs, or devtools.

    Keep full vaults internal. Return status/revision plus visible projections.
    Sync review should expose visible metadata and a `passwordChanged` flag; use a
    separate explicit reveal flow if remote-password inspection is required.

11. **Initialization and enrollment activate hot sessions without auto-lock.**
    [packages/core/src/use-cases/vault-lifecycle/initialize-vault.ts:217](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/initialize-vault.ts#L217),
    [packages/core/src/use-cases/device-trust/perform-device-enrollment.ts:417](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/perform-device-enrollment.ts#L417)

    Both workflows commit an active encrypted session payload and raw session
    material but have no lock-task repository or scheduler dependency. Only the
    unlock workflow schedules a lock, so these sessions can remain hot until a
    manual lock or process teardown.

    Either leave these workflows locked or share one atomic activation service
    that validates the delay, writes lock metadata, schedules the task, commits
    the session, and rolls all three back consistently.

12. **The documented minimum master-password policy is not enforced at runtime.**
    [packages/core/src/domain/master-password.ts:3](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/master-password.ts#L3),
    [packages/core/src/use-cases/vault-lifecycle/initialize-vault.ts:59](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/initialize-vault.ts#L59),
    [packages/core/src/use-cases/vault-lifecycle/change-master-password.ts:77](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/change-master-password.ts#L77),
    [packages/core/src/use-cases/device-trust/recover-device-access.ts:193](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/recover-device-access.ts#L193)

    `RawMasterPassword` is only a compile-time brand. JavaScript callers or a cast
    can initialize or re-protect a vault with an empty/one-character password,
    undermining resistance to offline guessing despite PBKDF2. The security spec
    requires at least 12 characters.

    Add a parser/schema that is the only way to construct new master passwords,
    and validate before IDs, randomness, secret reads, crypto, or persistence.
    Unlock should retain compatibility with already-created weak vaults.

13. **Concurrent clipboard operations can leave a password indefinitely.**
    [packages/core/src/use-cases/clipboard/copy-entry-password.ts:80](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/clipboard/copy-entry-password.ts#L80),
    [packages/core/src/use-cases/clipboard/copy-entry-password.ts:113](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/clipboard/copy-entry-password.ts#L113),
    [packages/core/src/use-cases/clipboard/copy-entry-password.ts:138](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/clipboard/copy-entry-password.ts#L138),
    [packages/core/src/services/clipboard/clipboard-clear.service.ts:70](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/clipboard/clipboard-clear.service.ts#L70)

    Two copy calls can both observe no task, overwrite task metadata, and race
    clipboard writes. The clipboard can end with password A while task B is
    current; alarm A is stale and alarm B removes metadata after seeing a
    different value, leaving A with no future clear. An older clear operation can
    also unconditionally remove a newer task after awaited clipboard/hash work.

    Serialize copy/clear operations or add action-ID CAS/conditional removal and
    re-check ownership after every awaited clipboard operation. Add deterministic
    interleaving tests.

14. **A lock-metadata read failure prevents clipboard cleanup.**
    [packages/core/src/use-cases/vault-lifecycle/lock-vault.ts:37](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/lock-vault.ts#L37),
    [packages/core/src/use-cases/vault-lifecycle/lock-vault.ts:49](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/lock-vault.ts#L49),
    [packages/core/src/use-cases/vault-lifecycle/lock-vault.ts:82](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/lock-vault.ts#L82)

    If reading the unrelated vault-lock task fails, execution jumps past
    clipboard lookup/clear and then removes the session. A copied password remains
    in the OS clipboard after the user locks. The current test at
    [packages/core/src/use-cases/vault-lifecycle/lock-vault.test.ts:208](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/lock-vault.test.ts#L208)
    codifies that clipboard lookup is skipped.

    Run cleanup phases independently, always attempting clipboard clear,
    scheduled-task cleanup, lock metadata removal, and both session record
    removals while preserving the first error.

15. **Freshly signed snapshots are re-read from hostile storage before upload.**
    [packages/core/src/use-cases/vault-entries/add-entry.ts:95](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-entries/add-entry.ts#L95),
    [packages/core/src/use-cases/vault-entries/update-entry.ts:101](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-entries/update-entry.ts#L101),
    [packages/core/src/use-cases/vault-entries/remove-entry.ts:75](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-entries/remove-entry.ts#L75),
    [packages/core/src/use-cases/sync/setup-sync.ts:84](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/sync/setup-sync.ts#L84),
    [packages/core/src/use-cases/sync/apply-sync-resolution.ts:326](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/sync/apply-sync-resolution.ts#L326),
    [packages/core/src/services/snapshot/vault-snapshot.service.ts:120](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/snapshot/vault-snapshot.service.ts#L120)

    These flows create a trusted in-memory signed snapshot, discard the object,
    then use `requireLocalVaultSnapshot`, which only reads and returns the current
    repository value. A hostile IndexedDB swap between save and re-read can upload
    an arbitrary or old snapshot under the already-reviewed remote CAS state.

    Return the exact signed `VaultSnapshot` from `persistUnlockedVault` and upload
    that object. If a reload is unavoidable, verify vault ID, expected descriptor,
    suite, signer, and signature again before upload.

16. **Most exported use cases cannot be constructed through the package API.**
    [packages/core/package.json:6](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/package.json#L6), [packages/core/src/index.ts:1](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/index.ts#L1),
    [packages/core/src/services/index.ts:1](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/index.ts#L1)

    The package exports only `.` and `./lib`, while the root barrel omits
    `services`. Twenty-four exported use-case implementations require concrete
    service classes such as `UnlockedVaultSessionService`,
    `VaultSnapshotService`, or `RandomSamplerService`. Those classes have private
    members, so callers cannot structurally substitute them, and package exports
    prevent importing their source paths. The extension composition root cannot
    instantiate the advertised public API without unsafe casts or forbidden deep
    imports.

    Export the service layer through a stable subpath/root barrel, or preferably
    expose public service interfaces/factories and keep concrete orchestration
    internal.

### Important

17. **All upload exceptions are treated as definite non-commits.**
    [packages/core/src/services/sync/vault-sync-guard.service.ts:128](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/sync/vault-sync-guard.service.ts#L128),
    [packages/core/src/services/sync/vault-sync-guard.service.ts:157](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/sync/vault-sync-guard.service.ts#L157),
    [packages/core/src/use-cases/device-trust/perform-device-enrollment.ts:441](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/perform-device-enrollment.ts#L441),
    [packages/core/src/use-cases/sync/apply-sync-resolution.ts:330](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/sync/apply-sync-resolution.ts#L330)

    A network timeout can occur after S3 committed the write. Core nevertheless
    restores old local state on every error. Enrollment completion additionally
    removes the new session and the only local device-slot/recovery material; if
    the remote write succeeded, cloud now trusts a device whose access material
    was destroyed, and replay sees enrollment as completed.

    Distinguish typed definite non-commit/CAS failures from outcome-unknown
    transport failures. For unknown outcomes, re-read the remote descriptor and
    reconcile or retain an explicit pending state before rollback.

18. **Completed-enrollment proof history is not compared or preserved as an
    append-only trust ledger.**
    [packages/core/src/domain/sync/key-slot-review.utils.ts:14](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/sync/key-slot-review.utils.ts#L14),
    [packages/core/src/use-cases/sync/apply-sync-resolution.ts:220](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/sync/apply-sync-resolution.ts#L220),
    [packages/core/src/use-cases/sync/apply-sync-resolution.ts:310](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/sync/apply-sync-resolution.ts#L310)

    Key-slot review ignores `completedEnrollments`. The special completion path
    validates one new proof but adopts the entire remote key-slot object without
    requiring all existing proofs to remain unchanged. Dropping an old proof can
    later remove the replay marker that prevents a revoked/former device from
    presenting the same enrollment proof again.

    Compare proof histories by stable identity and full content. Accept only
    local history plus exactly one newly verified proof; reject removals,
    mutations, duplicates, and unrelated additions.

19. **Snapshot descriptor comparison ignores vault identity.**
    [packages/core/src/domain/snapshot/vault-snapshot-descriptor.utils.ts:6](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/snapshot/vault-snapshot-descriptor.utils.ts#L6),
    [packages/core/src/use-cases/sync/sync-upload.ts:60](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/sync/sync-upload.ts#L60),
    [packages/core/src/services/sync/vault-sync-guard.service.ts:82](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/sync/vault-sync-guard.service.ts#L82)

    `compareVaultSnapshotDescriptors` compares only version vectors. Callers do a
    full descriptor equality check only in the `equal` branch, so a descriptor
    for vault B with a lower vector can reach vault A's upload as expected CAS
    state. Depending on adapter targeting, this can cause a cross-vault write or
    an opaque provider failure.

    Reject differing `vaultId`s before calculating a relation and test all
    relation branches with a wrong-vault descriptor.

20. **Schema versions are compile-time literals, not hostile-boundary checks.**
    [packages/core/src/domain/snapshot/vault-snapshot.ts:10](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/snapshot/vault-snapshot.ts#L10),
    [packages/core/src/domain/device-trust/device-enrollment-bundle.ts:10](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/device-trust/device-enrollment-bundle.ts#L10)

    No runtime path checks snapshot `schemaVersion` or enrollment-bundle
    `version`. An old client can accept a legitimately signed future-schema
    object, process only known fields, and re-sign it while silently dropping
    future entry/trust data.

    Add strict runtime codecs/assertions at local repository, sync provider, and
    enrollment import boundaries. Reject unsupported versions before decrypting
    or mutating.

21. **Local vault deletion bypasses the lock cleanup workflow.**
    [packages/core/src/use-cases/vault-lifecycle/delete-local-vault.ts:29](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/delete-local-vault.ts#L29),
    [packages/core/src/use-cases/vault-lifecycle/lock-vault.ts:38](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/lock-vault.ts#L38)

    Deletion calls raw session removal and then deletes persistence. It does not
    clear a copied password or cancel/remove clipboard and lock tasks.
    `VaultLockTask.vaultId` is never checked; a leftover alarm can later lock a
    newly initialized/enrolled session, especially because those flows install no
    replacement timer.

    Centralize lifecycle cleanup, use it before deletion, and bind scheduled
    execution to action ID plus active vault/session generation.

22. **Device access material is not identity-bound before use or overwrite.**
    [packages/core/src/use-cases/vault-lifecycle/unlock-vault.ts:75](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/unlock-vault.ts#L75),
    [packages/core/src/use-cases/vault-lifecycle/change-master-password.ts:41](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/change-master-password.ts#L41)

    Neither path checks `DeviceAccessMaterial.vaultId` against the target.
    Password change also does not verify that the material's device ID/public key
    matches the active session before re-wrapping and saving it. A hostile or
    misindexed repository response can therefore cause another vault/device
    record to be overwritten and become inaccessible.

    Validate cross-record IDs and bind the unwrapped private key to the expected
    active device before any write. Recovery already performs the analogous
    backup-vault check.

23. **Raw key buffers and ephemeral derivation material are never wiped.**
    [packages/core/src/services/session/unlocked-vault-session.service.ts:120](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/services/session/unlocked-vault-session.service.ts#L120),
    [packages/core/src/lib/secure-wipe.utils.ts:15](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/lib/secure-wipe.utils.ts#L15),
    [packages/core/src/use-cases/vault-lifecycle/initialize-vault.ts:70](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/initialize-vault.ts#L70),
    [packages/core/src/use-cases/vault-lifecycle/unlock-vault.ts:151](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/unlock-vault.ts#L151),
    [packages/core/src/use-cases/vault-lifecycle/change-master-password.ts:61](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-lifecycle/change-master-password.ts#L61)

    `secureWipe` has no production caller. Lock/removal drops repository records
    without zeroing the raw ArrayBuffer VMK, private signing key, or session
    payload key. Root/protection/recovery intermediate keys are likewise left for
    garbage collection. This does not guarantee erasure in JavaScript, but it
    misses the project's stated best-effort memory-wipe requirement entirely.

    Assign wipe ownership explicitly across core and adapters. Wipe ephemeral
    buffers in `finally`, and wipe retrieved hot material before/while removing
    records without preventing the remaining cleanup attempts.

24. **Recovery-word "rotation" cannot revoke the old words under rollbackable
    storage.**
    [packages/core/src/use-cases/device-trust/recover-device-access.ts:147](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/recover-device-access.ts#L147),
    [packages/core/src/use-cases/device-trust/recover-device-access.ts:205](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/device-trust/recover-device-access.ts#L205),
    [packages/core/src/domain/device-trust/device-access-recovery-backup.ts:7](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/device-trust/device-access-recovery-backup.ts#L7)

    Recovery unwraps the old local device slot/private signing keys and wraps
    those same keys under a new mnemonic. An attacker retaining the old backup
    and mnemonic can replay the backup and recover the still-trusted identity
    indefinitely. The domain comment acknowledges this limitation, but callers
    must not present the new words as invalidating old copies.

    True revocation requires a fresh device identity/key slot plus an authorized
    trust transition, or a trustworthy monotonic anti-rollback mechanism.

25. **Malformed URL errors retain secret-bearing raw input in their cause.**
    [packages/core/src/domain/entry/sanitized-entry-url.utils.ts:5](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/entry/sanitized-entry-url.utils.ts#L5),
    [packages/core/src/use-cases/vault-entries/add-entry.ts:54](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/use-cases/vault-entries/add-entry.ts#L54),
    [packages/core/src/errors/vault-entry.errors.ts:12](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/errors/vault-entry.errors.ts#L12)

    Native `new URL(rawUrl)` failures retain an `input` field. For malformed
    input containing `user:password@...` or sensitive query data, Add/Update wrap
    that native error as `InvalidPasswordEntryError.cause`; error logging or
    inspection can expose the secret.

    Replace parse failures with a static project error that does not retain the
    raw native error/input. Continue exposing only the parsed protocol for the
    supported-protocol error.

### Nits

26. **Eight type-only modules use runtime imports.**
    [packages/core/src/domain/entry/password-entry.type.ts:1](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/entry/password-entry.type.ts#L1),
    [packages/core/src/domain/entry/search-entry-query.type.ts:1](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/entry/search-entry-query.type.ts#L1),
    [packages/core/src/domain/entry/tag.type.ts:1](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/entry/tag.type.ts#L1),
    [packages/core/src/domain/scheduled-task/scheduled-task-delay.type.ts:1](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/domain/scheduled-task/scheduled-task-delay.type.ts#L1),
    [packages/core/src/lib/generate-password/generated-password.type.ts:2](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/lib/generate-password/generated-password.type.ts#L2),
    [packages/core/src/lib/generate-username/generated-username.type.ts:1](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/lib/generate-username/generated-username.type.ts#L1),
    [packages/core/src/errors/generate-password.errors.ts:1](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/errors/generate-password.errors.ts#L1),
    [packages/core/src/errors/generate-username.errors.ts:1](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/errors/generate-username.errors.ts#L1)

    These imports are used only in type positions (`z.infer`, `typeof`, or a
    constructor annotation), so normal imports violate the repository's
    `import type` rule and preserve unnecessary runtime dependencies under
    `verbatimModuleSyntax`. Convert both Zod types and schema symbols used only by
    `typeof` to type imports.

27. **Username normalization gives one word twice the intended probability.**
    [packages/core/src/lib/generate-username/generated-username.utils.ts:55](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/lib/generate-username/generated-username.utils.ts#L55),
    [packages/core/src/lib/generate-username/generated-username.const.ts:7750](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/lib/generate-username/generated-username.const.ts#L7750),
    [packages/core/src/lib/generate-username/generated-username.const.ts:7755](https://github.com/ArionStudio/engr-serverless-pm/blob/50e60bb8c8006d1445121e19e1144d7690ad4eb2/packages/core/src/lib/generate-username/generated-username.const.ts#L7755)

    The 7,776 raw words are unique, but `yo-yo` and `yoyo` both normalize to
    `yoyo`, leaving 7,775 unique outputs and making that value twice as likely.
    Deduplicate the normalized source or remove one row.

### Cross-Cutting Research Follow-Up

28. **Core contracts may duplicate authoritative state and derived views across
    parameter graphs.**
    [packages/core/src/domain/sync/sync-resolution.utils.ts:23](packages/core/src/domain/sync/sync-resolution.utils.ts#L23),
    [packages/core/src/domain/sync/entry-resolution.utils.ts:16](packages/core/src/domain/sync/entry-resolution.utils.ts#L16),
    [packages/core/src/use-cases/sync/apply-sync-resolution.ts:299](packages/core/src/use-cases/sync/apply-sync-resolution.ts#L299)

    This is a whole-core research finding recorded on 2026-08-02 after the
    original review. It is not limited to Finding 10 or to sync resolution, and
    it is not yet classified as a verified behavior or security defect.

    The sync-resolution path is representative: callers pass local and remote
    vaults together with a review derived from those vaults, a resolution that
    repeats item identifiers, and the resolving device id. Entry reviews also
    repeat the outer `entryId` inside local and remote projections. Resolution
    then reads relations from the review while selecting actual content from the
    vaults. Current callers build these values together, but the contract admits
    multiple sources of truth that could drift, become stale, retain data longer
    than necessary, or make future security review harder.

    Research the complete core before choosing a fix. Inventory exported
    use-case commands/results, service and domain helper signatures, nested
    context objects, and all call sites. For each repeated field, distinguish
    intentional boundary denormalization from duplicated authoritative state,
    identify one canonical owner, and verify whether callers can construct
    inconsistent combinations. The resulting proposal should cover the whole
    core, preserve public error behavior and security checks, and stage only
    evidence-backed contract reductions with focused regression tests. Do not
    solve this as a local sync-only cleanup.

## Overall Assessment

The package is not ready to be treated as a security boundary or a complete
locally owned multi-device core. The strongest local happy paths are thoughtfully
ordered and the test suite is broad, but the current tests are almost entirely
sequential and trusted-fixture based. They therefore miss the highest-risk
classes found here: hostile-storage trust substitution, rollback, concurrent
session/snapshot mutation, outcome-unknown distributed writes, and key-rotation
semantics.

The main cohesion issue is duplicated transaction/rollback orchestration across
entry mutations, snapshot service, sync guard, enrollment, conflict resolution,
disable, and lifecycle cleanup. Explicit state machines for session activation,
local snapshot CAS, remote write outcomes, and trust transitions would remove
many inconsistent failure branches.

Finding 28 adds a separate contract-shape concern for later whole-core research:
internal and boundary APIs may carry the same state in both authoritative and
derived forms. Its scope and remediation remain intentionally unresolved until
the core-wide inventory described in the finding is completed.

## Scope Accounting

All 222 tracked files under `packages/core` were reviewed. The sorted path-list
SHA-256 was
`bd2d9b37e1732fbd6421a52e97b632daff402f563adf92ed2e7ee276c159a0fe`.

| Area                               |   Files | Result                                                                        |
| ---------------------------------- | ------: | ----------------------------------------------------------------------------- |
| Package/config plus `src/index.ts` |       4 | Finding 16; config otherwise okay                                             |
| `src/__tests__/fixtures`           |       6 | Reviewed; no fixture defect, but adversarial/concurrency fixtures are missing |
| `src/domain`                       |      84 | Findings 1, 8, 18–20, 24, 25, 26, 27                                          |
| `src/errors`                       |      16 | Findings 25 and 26; error names/messages otherwise okay                       |
| `src/lib`                          |      16 | Findings 23, 26, 27                                                           |
| `src/ports`                        |      20 | Findings 4, 9, 16, 23; dependency direction otherwise okay                    |
| `src/services`                     |      14 | Findings 2–4, 7, 13–15, 17                                                    |
| `src/use-cases`                    |      62 | Findings 1–17, 19–25                                                          |
| **Total**                          | **222** | **27 original findings plus 1 post-review research finding**                  |

### Reviewed Areas With No Additional Findings

- Current `spm-v1` algorithm-suite parameter values match the live core model.
- Base64url round-trip, character, padding, and length checks have no identified
  current security failure. Non-canonical zero pad bits are accepted, but no
  concrete exploit was found in current call paths.
- Random sampling correctly uses uint32 rejection sampling and validates the
  upper bound and byte length.
- Password generation validates settings, handles impossible configurations,
  satisfies required groups, and uses an unbiased Fisher-Yates shuffle.
- Valid URL sanitization removes credentials, query strings, and fragments and
  accepts only HTTP(S). Finding 25 concerns malformed-input error retention.
- Read/Search themselves return the intended visible entry projection; the
  exposure is in the broader workflow APIs listed in Finding 10.
- Search matching and JSON canonical comparison are coherent for their current
  domain inputs.
- Ordinary entry and device mutation helpers preserve immutability, vectors, and
  tombstones in their supported sequential paths.
- Session split-record crash ordering is otherwise sound: payload is saved before
  material, removal attempts both records, and decryption errors are wrapped.
- Snapshot encryption/sign/save ordering prevents save after encryption/signing
  failure, when the input trust state is genuinely authenticated.
- Initialize uses the atomic repository creation port and attempts rollback on
  session-commit failure. Unlock validates delay before secret reads and cleans
  scheduled metadata in its sequential failure paths.
- No explicit `any`, production console calls, JavaScript `delete`, forbidden UI/
  adapter imports, or default exports outside the Vitest entry/config were found.
- Domain/ports/services/use-case import direction is preserved.
- No additional defect was found in barrel error naming, static error names, or
  the core TypeScript/Vitest configuration.

## Verification

- `pnpm core:type-check` — **PASS**.
- `pnpm --filter @lfspm/core exec vitest run` — **PASS**: 40 files, 333 tests.
- Production advisory check (`pnpm audit --prod --json`, filtered to dependency
  paths beginning at `packages__core`/`@lfspm/core`) — **no core production
  advisory path reported** on 2026-07-12. The unfiltered workspace audit did
  report out-of-scope application/tooling paths.
- Static project-rule scans — no explicit `any`, production console, `delete`,
  forbidden framework/adapter import, or disallowed default export in core.
- Runtime probes confirmed crossed vectors return `broken`, matching the strict
  synchronized-mode constraint. They also confirmed malformed native URL errors
  retain their raw input and the username list normalizes to 7,775 unique values
  from 7,776 rows.
- No instrumented statement/branch coverage was run; no coverage provider is
  configured for this package.

## Highest-Value Missing Tests

1. Stale mutation resumes after lock and must not recreate a session.
2. Concurrent session commits/activations with controlled interleaving.
3. Concurrent local snapshot mutations with both reads before either CAS save.
4. Self-signed candidate/key-slot substitution and replay of an older valid
   snapshot.
5. Revoked device cannot decrypt the next snapshot; surviving devices can adopt
   the rotation/revocation.
6. Intercepted/malformed/unknown-version enrollment bundles are rejected.
7. Initialization and enrollment always install or intentionally avoid an active
   session lock timer.
8. Every non-password result is recursively checked for stored passwords and
   provider credentials.
9. Conditional remote deletion with a descriptor change between preflight and
   delete, plus local persistence failure after remote action.
10. Outcome-unknown upload where remote committed but the provider call rejected.
11. A local-ahead synchronized vault is reconciled or blocked before another
    mutation; crossed vectors remain rejected as unsupported concurrency.
12. Concurrent clipboard copy/clear interleavings and cleanup despite unrelated
    lock-metadata failure.
13. Hostile replacement between local snapshot save and upload.
14. Existing completed-enrollment proof preservation plus exactly one new proof.
15. Wrong-vault descriptors in every causal relation.
16. Master-password minimum boundaries on all new-password workflows.
17. Device-access-material vault/device/key mismatches.
18. Wiping nonzero hot and ephemeral key buffers without skipping later cleanup.
19. Malformed credential-bearing URL does not survive in an error/cause.

## Open Architectural Questions

- What external or platform-protected source will anchor snapshot freshness when
  all IndexedDB state is explicitly rollbackable?
- Is recovery-word rotation intended to invalidate old words, or only issue a
  newer backup while documenting that old copies remain valid?
- What transport/authentication model protects enrollment bootstrap data, and
  can the target device generate its own private identity before authorization?
- Which device-key model will allow one trusted device to rotate the vault key
  for every remaining device without possessing their symmetric slot secrets?

## Suggested Remediation Order

1. Freeze release/integration on trust bootstrap, master-password policy, secret
   result exposure, session generation/CAS, snapshot CAS, and clipboard leakage.
2. Redesign enrollment and revocation/key rotation before treating multi-device
   trust as a security feature.
3. Enforce exact synchronization before each synchronized-mode mutation, then
   add conditional deletion and an outcome-aware remote state machine.
4. Add runtime codecs/version checks and eliminate hostile-storage re-reads.
5. Centralize lifecycle cleanup/wiping and expose a constructible package API.
6. Complete the whole-core contract/source-of-truth inventory from Finding 28
   before refactoring individual signatures.
7. Address the two convention/entropy nits after correctness and security fixes.
