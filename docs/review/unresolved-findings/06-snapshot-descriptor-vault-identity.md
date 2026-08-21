# Work Packet: Bind Snapshot Descriptor Comparison to Vault Identity

Finding: 19.

Resolution unit: **work item 17**. Finding 19 is the first slice and Finding 17
in the companion [remote-upload packet](05-remote-upload-outcomes.md) is the
second; completing this packet alone does not close the work item.

Status: open and narrow. It is independently reviewable as the first slice of
work item 17, but it is not dispatched as a separate single-number work item.

## Verified current behavior

[`compareVaultSnapshotDescriptors`](../../../packages/core/src/domain/snapshot/vault-snapshot-descriptor.utils.ts#L28)
compares only version vectors. `vaultId` is checked by
`areVaultSnapshotDescriptorsEqual`, but several callers perform that full check
only in the `equal` branch. A wrong-vault descriptor with a lower, higher, or
diverged vector can therefore reach relation-specific logic or an upload CAS
argument before identity is rejected.

## Required invariant

No causal relationship exists between snapshots from different vaults.
Descriptor comparison must reject or return the existing integrity/broken
relation before comparing vectors, regardless of whether vectors look equal,
ahead, or diverged.

## Recommended implementation

Make the domain comparison utility the single owner of this invariant. Return
the existing `broken` relation for mismatched vault IDs if that matches the
current relation model, then ensure every caller maps `broken` to its established
integrity error. Do not add repeated `vaultId` checks at all callers.

Keep `areVaultSnapshotDescriptorsEqual` unchanged as the exact equality helper
for ID, vector, and timestamp.

## Required regression tests

- Wrong-vault descriptors return `broken` for vector relations that would
  otherwise be equal, local-ahead, remote-ahead, and diverged.
- Sync upload, strict mutation guard, sync review, sync resolution, and sync
  disable reject the wrong-vault descriptor before upload/download/delete.
- No provider mutation method is called after the mismatch.
- Same-vault relation behavior remains unchanged.

## Independence

This is a standalone implementation slice and must precede Finding 17. It does
not require an adapter change or public API redesign.

## Non-goals

- Do not change timestamp equality semantics.
- Do not alter version-vector rules.
- Do not add provider-specific vault targeting to core.

## Completion evidence

Run descriptor utility tests and all sync tests that call the comparison helper,
then `pnpm core:type-check` and the full core suite.
