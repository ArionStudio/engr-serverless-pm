# Sync Strategy

> Sync is optional, local-first, and user-controlled. The project operates no
> credential or coordination server.

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
envelopes, and one new envelope for every added identity. A new identity's
active profile is mandatory enrollment state and cannot be removed by a sync
resolution. Other accompanying entry, tag, or device-profile changes use the
normal review and resolution model.

Remote and local writes use snapshot descriptors for compare-and-set checks.
This prevents a reviewed snapshot from overwriting a newer remote or local
snapshot.

## Initial setup

Provider setup normalizes the user input into a shared target and local
credentials. The target is persisted through the encrypted vault snapshot. The
credentials are encrypted with the device-local protection key and persisted
only in the local vault repository.

If setup, snapshot persistence, or upload fails, the local credential record and
vault state are restored to their prior state.

## Enrollment

The registered device never exports its provider credentials. When an enrolled
vault has a sync target, the target device asks the user for credentials,
normalizes them through the provider adapter, and confirms that they address the
same target and current snapshot before completing local initialization.

## Device revocation

Synchronized revocation requires replacement credentials. The revoking device:

1. confirms its local snapshot exactly matches the current remote descriptor;
2. validates and normalizes the replacement credential;
3. confirms the normalized target is unchanged and sees the same remote
   snapshot;
4. stages the replacement locally while retaining the old credential;
5. rotates the vault master key and uploads the generation-incremented
   revocation snapshot with the replacement credential.

The rotated snapshot, trust checkpoint, and staged credential state are written
by one local compare-and-set transaction. Failed local persistence changes none
of them; failed upload restores all three together. If
the remote upload succeeds but session commit fails, the local session is
invalidated and the replacement credential is retained so a later unlock can
recover the rotated snapshot.

No other enrollment, revocation, or sync removal may bypass a pending provider
credential revocation.

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
and credential state use compare-and-set and the session receives the new key
only after any required upload succeeds.

## Completing provider revocation

Core does not create, disable, or delete AWS credentials. The user completes the
external action:

1. Create a replacement credential in AWS.
2. Enter it during device revocation.
3. Upload the rotated vault.
4. Disable or delete the old credential in AWS.
5. Run verification in the app.
6. Enter the replacement credential once on each survivor before its next sync.

Verification calls the provider with the encrypted previous credential:

- `accessible` keeps revocation pending;
- `authentication_rejected` removes the old local credential and completes the
  workflow;
- network, rate-limit, and indeterminate provider failures propagate and leave
  the workflow pending.

Credential removal is idempotent. Core never reports provider revocation as
complete until the provider rejects the old credential.
