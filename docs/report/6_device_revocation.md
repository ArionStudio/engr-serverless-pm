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

## Follow-up review findings

Generic sync still rejects all trust, generation, and key-slot changes. A new
dedicated prepare/apply workflow now accepts a newer snapshot only when every
certificate after the survivor's local trust point proves a revocation:

- each certificate removes exactly one trusted identity and adds none;
- each removal advances the signed vault-key generation exactly once;
- all survivor signing and wrapping public keys are unchanged;
- every final survivor has exactly one fresh current-generation envelope;
- all revoked profiles and slots were removed consistently;
- the final snapshot is causally ahead and retains the vault creation time.

This resolves the first follow-up finding: an offline survivor can skip multiple
consecutive revocations. Its encrypted credential state records every removed
device ID but retains only the previous credential that this survivor actually
possessed.

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

The survivor enters the latest replacement S3 credential once and opens the
final envelope with its existing private wrapping key. It does not need
re-enrollment or a simultaneous connection to the revoking device.

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
