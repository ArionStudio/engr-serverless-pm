# Decision Packet: Recovery-Word Rotation Semantics

Finding: 24.

Resolution unit: **work item 24** (Finding 24 only).

Status: accepted limitation under the current threat model unless the product
contract is changed.

## Verified current behavior

[`RecoverDeviceAccessUseCase`](../../../packages/core/src/use-cases/device-trust/recover-device-access.ts#L256)
generates a new mnemonic and replaces the current local recovery backup, but it
wraps the same device private identity. The domain contract explicitly states in
[`device-access-recovery-backup.ts`](../../../packages/core/src/domain/device-trust/device-access-recovery-backup.ts#L6)
that a copied or rolled-back older backup remains decryptable with the older
words.

The new trust chain prevents reuse of an identity after that identity is
revoked, but merely replacing a local backup does not revoke the still-trusted
identity. Complete coordinated rollback also remains an accepted limitation
without an independent monotonic witness.

## Safe standalone track: honest product/API semantics

This work can be completed independently:

1. Describe the operation as replacing the current local recovery backup, not
   revoking all previous words.
2. Ensure API names, result copy, UI text, and security documentation do not say
   old copies become invalid.
3. Warn users that copied/rolled-back backups remain usable while that device
   identity remains trusted.
4. Add tests only where code exposes misleading state or claims; documentation
   alone cannot enforce revocation.

## Non-standalone track: true credential revocation

Do not begin implementation without an architecture decision. True revocation
would require at least:

- a fresh device signing/wrapping identity;
- an authorized trust transition that removes the old identity and adds the new
  one without reusing historical keys;
- vault-key generation/slot rotation as required by the trust model;
- sync convergence for surviving devices;
- migration of local access material, checkpoint, recovery backup, and session;
- a defined recovery story if no other trusted device can authorize the change.

Even that does not defeat a rollback of every local protected record. Preventing
complete coordinated rollback requires an external monotonic witness or another
device that remembers the newer trust state.

## Decision questions

1. Is the required product promise only "replace the recovery backup on this
   device"?
2. Must old words stop working against retained copies?
3. Which trusted identity authorizes replacement if the recovering identity is
   considered compromised?
4. Is an external or second-device freshness witness acceptable?
5. What happens when the user has only one device?

## Acceptance criteria

For the standalone semantics track:

- No user-facing or API documentation claims that old words are globally
  revoked.
- The limitation is linked from recovery instructions and the threat model.
- The current backup is replaced atomically as already required.

For a future true-revocation design:

- Threat scenarios cover retained old backup, old words, hostile local rollback,
  remote rollback, single-device recovery, and multi-device convergence.
- The design names the monotonic trust source or explicitly accepts the residual
  rollback limit.
- Implementation is split into trust transition, key rotation, local migration,
  sync consumption, and UI/recovery packets.

## Stopping point

If the product does not require a stronger promise, finish the terminology and
documentation track and close the issue as an accepted limitation. Do not build
a fake revocation mechanism that only overwrites current local storage.
