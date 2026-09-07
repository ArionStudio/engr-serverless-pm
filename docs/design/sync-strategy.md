# Sync Strategy

> Vault data is locally owned and sync is optional and user-controlled. The
> project operates no credential or coordination server.

## Operating modes

A vault without sync configured operates locally and permits offline mutations.
Once sync is configured, every mutation requires network access and an exact
match between the verified local snapshot and the current remote snapshot
identity (descriptor plus cryptographic digest).
This synchronized mode assumes one user operates one device at a time.

The remote object coordinates synchronized state but remains hostile storage.
Remote content is authenticated and is never accepted silently. Local unlock
and read behavior is unchanged by the mutation gate.

Before a synchronized mutation, descriptor relations are handled as follows:

| Relation                    | Behavior                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Exact descriptor equality   | Download, authenticate, and require the exact snapshot digest before permitting the mutation |
| `remote_ahead`              | Block and require explicit verified download and review                                      |
| `local_ahead`               | Block and require explicit upload of the existing local snapshot                             |
| `broken` or crossed vectors | Reject as an integrity failure or unsupported concurrency                                    |
| Remote snapshot missing     | Reject because synchronized state cannot be confirmed                                        |

A local-ahead snapshot is a recovery state, not a valid base for another
mutation. The normal upload workflow must synchronize it before the mutation is
retried. Concurrent or offline edits from multiple synchronized devices are not
supported.

## Shared target and local credentials

The encrypted vault stores only a non-secret `SyncTarget`:

```ts
type SyncTarget = {
  readonly provider: SyncProvider;
  readonly targetConfig: JsonValue;
};
```

It identifies values such as an S3 bucket, region, and object prefix. Provider
credentials are stored separately on each device as encrypted local state:

```ts
type SyncCredentials = {
  readonly provider: SyncProvider;
  readonly credentialsConfig: JsonValue;
};

type SyncAccess = {
  readonly target: SyncTarget;
  readonly credentials: SyncCredentials;
};
```

The local credential ciphertext is authenticated against the vault ID, local
device ID, provider, and canonical target. It cannot be copied to another device
or target without decryption failing.

Shared snapshots and enrollment responses never contain provider credentials.
The user enters a credential separately on every device.

## Normal sync

Normal sync requires:

1. an unlocked vault containing a sync target;
2. decryptable local credentials for that target;
3. a local snapshot verified against the device's trust anchor and checkpoint.

Provider operations receive normalized `SyncAccess`. Authentication rejection is
distinct from network errors, rate limits, and indeterminate provider failures.
Generic sync accepts ordinary vault-content changes but rejects trust-chain,
vault-key-generation, or device-slot changes. Those changes must use a dedicated
device-trust workflow.

An existing survivor consumes enrollment additions through a dedicated
prepare/apply workflow. It accepts only an authenticated addition-only trust
suffix, an unchanged vault-key generation, unchanged existing device
envelopes, and one new envelope for every added identity. A completed
enrollment's active profile is mandatory state and cannot be removed by a sync
resolution. An enrollment that is still pending may remain profile-less until
the target completes it. Other accompanying entry, tag, or device-profile
changes use the normal review and resolution model.

Remote writes use a descriptor plus cryptographic snapshot digest as their
exact compare-and-set identity. Local writes compare the snapshot digest, the
exact signed trust checkpoint, and (when applicable) the exact encrypted
credential artifact. Every snapshot prepared for upload signs the original
nullable remote identity into `metadata.uploadExpectedRemoteSnapshotIdentity`.
That historical identity is the only remote state the candidate may replace. A
later upload may observe that the remote already equals the candidate, but it
must never adopt a newly observed remote object as the candidate's expectation.

## Initial setup

Provider setup normalizes the user input into a shared target and local
credentials. The target is persisted through the encrypted vault snapshot. The
credentials are encrypted with the device-local protection key and persisted
only in the local vault repository.

If setup or snapshot persistence fails, the local credential record and vault
state are restored to their prior state. A definite upload non-commit restores
them as well. An indeterminate upload preserves the newly signed local snapshot,
commits the matching session, and reports sync as pending so normal upload can
reconcile it.

## Upload outcomes

The sync-provider boundary distinguishes a committed write, a definite
non-commit, and an outcome-unknown write. Definite non-commits distinguish a
remote compare-and-set change from a static provider rejection such as invalid
authorization, configuration, or request input. Read-only provider preparation
may reject before a remote write is initiated. Once the synchronous start
operation is invoked, rejected or malformed results are treated as outcome
unknown; recognized single-attempt provider rejections resolve as definite
non-commits. Automatic
provider retries mean a later rejection is not proof that an earlier attempt
failed.

A definite remote change is surfaced as a sync conflict, while a definite
provider rejection retains its provider-rejection error; both restore the prior
local snapshot, checkpoint, credential state, and matching session. An unknown
outcome instead retains and commits the candidate as pending because rollback
could diverge local state from a write that actually committed remotely.

For an unknown outcome, workflows keep the candidate local snapshot and commit
the corresponding unlocked session with `syncUpload` marked `pending`. Before
the remote write begins, a local compare-and-set transaction stores an encrypted
device-local reconciliation intent alongside the candidate snapshot. The intent
binds the exact candidate descriptor and digest to the original nullable remote
descriptor-and-digest identity used for compare-and-set; the signed candidate
metadata carries the same historical expectation.

Every synchronized snapshot mutation compares the snapshot digest, the exact
signed checkpoint artifact, and the exact current encrypted credential
artifact—ciphertext and nonce, or record absence—even when that credential
artifact remains unchanged.
Intent staging, clearing, rollback, and credential replacement use the same
transaction. A stale writer therefore cannot persist over or remove a newer
reconciliation intent. If intent cleanup loses that compare-and-set race, the
workflow remains pending instead of claiming completion.
Secret-dependent intent staging and restaging and their local compare-and-set
writes are serialized against the originating active session. Provider
preflight may run outside that boundary, but it returns a synchronous start
operation; the conditional upload or removal is started only after the
originating session is revalidated, and its network response is awaited outside
the session boundary. A concurrent lock therefore cannot wipe the protection
key during an intent write or allow a later remote mutation to start from revoked session authority;
if the session disappears before post-commit cleanup, the exact encrypted
intent remains pending for reconciliation.

Each reconciliation retry first compare-and-set refreshes the encrypted intent
artifact before invoking the provider. This makes that attempt's exact
ciphertext and nonce its local ownership token: a definite non-commit restores
the prior intent only while the refreshed artifact is still current, while an
unknown outcome retains it. A fresh upload similarly clears only the exact
intent artifact that it staged after a definite pre-write failure.

The next normal upload downloads and verifies the remote before clearing an
intent whose remote identity equals the candidate. It retries only when the
downloaded remote still equals the recorded historical descriptor and digest,
and reports a conflict without overwriting when the remote is
absent, rolled back, or otherwise changed. Because IndexedDB is hostile storage,
the signed snapshot expectation remains authoritative if the encrypted intent
record is removed or replayed: an intent that disagrees with the signed metadata
is an integrity failure, and an absent intent does not authorize adopting the
fresh remote observation as a new expectation. Until reconciliation completes,
fresh vault mutations and sync removal are blocked; only an already-persisted
removal transition may resume its recorded compare-and-set cleanup.

## Accepting a remote review

ApplySyncResolution repeats the reviewed local/remote identity, trust, key-slot,
configuration and item-choice checks before persistence. If every choice is
`use_remote`, the local repository adopts the exact authenticated remote
snapshot and its vectors. Acceptance does not create another content revision,
re-sign the snapshot or upload it. Entries, tags, profiles and tombstones keep
the remote versions. Pending upload cleanup is atomic with this explicit remote
adoption. Local or mixed choices still author a new resolution and use the
existing conditional upload, definite non-commit rollback and uncertain-outcome
contracts. Repeated checks between devices that accepted the same snapshot
therefore return equal state without another review.

## Routine device credential repair

`UpdateSyncCredentialsUseCase` replaces credentials on an already configured,
unlocked device. It normalizes the supplied provider configuration and requires
the existing provider and target namespace. It then performs the provider's
read-only access probe. Authentication rejection, network failure and malformed
provider outcomes do not replace local state. Successful probing establishes
read access; it does not prove write permission or claim that a snapshot was
uploaded. This workflow does not create or revoke credentials in AWS.

The existing encrypted credential record must be present and decryptable.
Missing or corrupt records are errors because routine replacement cannot infer
lost pending-upload or revocation evidence. The replacement preserves that
evidence, rejects reusing a credential awaiting revocation, and atomically
compares the old credential artifact, authenticated snapshot and checkpoint.
It changes only the encrypted credential artifact: no snapshot revision, trust
transition or remote write. Network work runs outside the session lease; key use
and persistence revalidate the originating session under that lease.

After repair, the caller can retry the existing sync/reconciliation workflow.
A pending upload remains pending until its remote outcome is verified. Provider
credential cleanup after device revocation continues to use its dedicated
workflow. Disabling sync is a separate destructive operation, not credential
repair or a pause switch.

## Enrollment

The registered device never exports its provider credentials. When an enrolled
vault has a sync target, the target device asks the user for credentials,
normalizes them through the provider adapter, and confirms that they address the
same target and current snapshot before completing local initialization.

## Device revocation

Synchronized revocation requires replacement credentials. The revoking device:

1. confirms its local snapshot exactly matches the current remote identity;
2. validates and normalizes the replacement credential;
3. confirms the normalized target is unchanged and sees the same remote
   snapshot;
4. stages the replacement locally while retaining the old credential;
5. rotates the vault master key and uploads the generation-incremented
   revocation snapshot with the replacement credential.

The rotated snapshot, trust checkpoint, and staged credential state are written
by one local compare-and-set transaction. Failed local persistence changes none
of them; a definite upload non-commit restores all three together. An unknown
upload outcome retains all three and reports sync pending for reconciliation.
If the originating session was removed or replaced while the upload was in
flight, finalization leaves that newer session untouched and reports the durable
result; if persistence into the still-current session fails, that session is
invalidated. The replacement credential remains available so a later unlock can
recover the rotated snapshot.

No other enrollment, revocation, or sync removal may bypass a pending provider
credential revocation.

The encrypted signed vault carries only a non-secret pending marker containing
the revoked device IDs and vault-key generation. The old credential itself
remains encrypted in device-local storage. Every device blocks further trust
and sync-removal operations while the shared marker exists in its trusted
state, and independently while it retains an unverified previous credential
locally.

## Survivor consumption

A survivor may miss one or more consecutive revocations. It enters the latest
replacement credential once, then prepares a revocation review. Preparation
verifies:

- the remote trust chain descends from its trusted local state;
- every skipped certificate either adds one identity without rotating the key
  or removes one identity while rotating it exactly once;
- survivor signing and wrapping public keys did not change;
- every survivor has exactly one matching new-generation envelope;
- all revoked profiles and slots were removed consistently;
- the final snapshot is causally ahead and retains the vault creation time.

When the suffix also contains enrollments, the review reports the added
identities explicitly and treats their final active profiles as mandatory state.
This lets an offline survivor process the current object without requiring
historical S3 versions.

The consumer applies those removals as a mandatory baseline. They are not
user-selectable resolutions and cannot be undone. Entry, tag, or surviving
profile changes made after the revocations are presented through the normal
sync review and resolution model.

Apply repeats all remote, trust, envelope, and vault checks. If no later content
changed, it persists the authenticated remote snapshot directly. Otherwise it
creates and uploads a resolved snapshot using the final trust chain,
generation, survivor slots, and rotated vault key. Local snapshot, checkpoint,
and credential state use compare-and-set. The session receives the new key after
a committed upload or an outcome-unknown upload retained for reconciliation; a
definite non-commit restores the prior state instead.

## Completing provider revocation

Core does not create, disable, or delete AWS credentials. The user completes the
external action:

1. Create a replacement credential in AWS.
2. Enter it during device revocation.
3. Upload the rotated vault.
4. Delete the old credential in AWS.
5. Run verification in the app.
6. Enter the replacement credential once on each survivor before its next sync.

Verification calls the provider with the encrypted previous credential:

- `accessible` keeps revocation pending;
- `authentication_rejected` removes the old local credential and completes the
  local verification. A device clears and uploads the shared marker only when
  its local pending metadata matches that marker;
- network, rate-limit, and indeterminate provider failures propagate and leave
  the workflow pending.

Deletion is required for verification. AWS reports an inactive key and an
active key denied by policy through the same ambiguous authorization failure,
so deactivation alone deliberately leaves the workflow pending.

Credential removal is idempotent. Core never reports provider revocation as
complete while the shared marker remains. Normal sync may consume a signed
marker removal but cannot add or replace the marker.

The shared marker describes only the final still-pending credential rotation.
Each earlier marker must be cleared before another device revocation can begin.
An offline survivor that skips several rotations records every skipped revoked
device with its own previous credential, but that credential can clear the
shared marker only when both records describe the same final rotation. A
survivor holding an older credential must not use its rejection to clear a
marker for an intermediate credential it never possessed.

If the remote vault advanced before a survivor completed its older local
verification, the local old credential is retained until the newer signed
remote state is reviewed. A later revocation-consumption flow may proceed after
the provider rejects that old credential; it then retains the survivor's
current credential as the previous credential for the newly consumed rotation.
