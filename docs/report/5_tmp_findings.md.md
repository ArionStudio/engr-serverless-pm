# Report nr 5

## Purpose

This report records current security design decisions made while implementing and reviewing the project. It supplements the earlier reports; it does not replace their original system-design or threat-model content.

Each decision records the problem being addressed, the implemented control, the security property it provides, and any remaining limitation. Additional decisions can be added to this report as the review and implementation continue.

## 1. Snapshot Trust and Local Rollback Protection

### 1.1 Problem

The encrypted vault snapshot, its device list, and the local database are attacker-controlled persisted data. A valid snapshot signature alone proves that a key signed the snapshot; it does not prove that the signing key was already trusted, nor that the snapshot is the latest state accepted by this device.

Without an independent trust anchor, an attacker could construct a snapshot with an attacker-controlled device key, list that key as trusted, and sign the snapshot with it. An attacker who can restore persisted data could also replay an older valid snapshot and thereby restore removed vault content or a revoked device.

### 1.2 Implemented decision

The core uses three linked records:

1. **Local genesis anchor** — created with the first vault state and protected as local device access material. It identifies the vault, the genesis device public signing key, and the digest of the exact first trust certificate.
2. **Signed vault trust chain** — every device-trust change creates a certificate signed by a device trusted by the preceding certificate. Each certificate links to the digest of the preceding certificate.
3. **Signed local checkpoint** — after accepting a snapshot, the device records its vault id, device id, accepted trust-chain position, snapshot version vector, and exact snapshot digest. The current device signs this record.

When unlocking, recovering access, enrolling a device, or accepting a synced snapshot, the implementation verifies the trust chain from the protected genesis anchor before using its trusted device list to verify the snapshot signature. It then compares the candidate snapshot and its trust-chain history to the signed local checkpoint.

The snapshot and checkpoint are persisted through one repository operation with an expected previous snapshot digest. An adapter must make that operation atomic: it must not leave a new snapshot with an old checkpoint, or the reverse, after an interruption.

### 1.3 What this resolves

- A snapshot cannot establish its own trusted signing key. Its signer must be present in a trust state verified from the protected genesis anchor.
- An altered or fabricated trust chain is rejected unless it starts with the exact anchored genesis certificate and every later transition is signed by a device trusted immediately before that transition.
- Replaying only an older snapshot is detected when its version vector is behind the locally checkpointed version vector.
- Supplying a different snapshot with the same version vector is detected because its exact snapshot digest differs from the checkpointed digest.
- Supplying a competing trust history is detected because the candidate chain must contain the exact checkpointed certificate digest at the checkpointed generation.
- Changing a checkpoint by itself is ineffective because the checkpoint is signed by the local device key and is verified before it is used.

### 1.4 What this does not resolve

This is not a global anti-rollback guarantee. An attacker able to restore **all** local protected records to an earlier internally consistent state can restore the earlier snapshot, trust chain, genesis anchor, and checkpoint together. The device then has no local evidence that a newer state ever existed.

Detecting that complete coordinated rollback would require an independent monotonic witness, for example a trusted remote service, a platform-provided monotonic store, or another device that remembers the newer state. The project deliberately does not depend on such a service or platform authority.

### 1.5 Decision and residual risk

The project accepts complete coordinated rollback as a limitation of its local-only, decentralised ownership model. The implemented controls still protect against the more common partial replay, tampering, self-authorised signer, and trust-fork attacks without adding an external server.

Users remain responsible for protecting local browser-profile data and any transferred enrollment material. Future work, such as a companion phone application acting as an additional trusted device, may provide another independent copy of accepted state, but it is not a current security dependency.

### 1.6 Implementation status

Implemented in core through the vault-trust domain contracts, `VaultTrustService`, vault lifecycle and device-trust workflows, and focused regression tests. The guarantee depends on a storage adapter correctly implementing the atomic snapshot-and-checkpoint repository contract.

## 2. Remote Sync Cleanup Is Retryable

### 2.1 Problem

Removing local sync configuration and deleting remote snapshots cannot be one atomic operation. A remote delete can fail after local state is saved, or succeed remotely while final local cleanup fails. Discarding the encrypted sync configuration too early would make a later retry impossible.

### 2.2 Implemented decision

Disabling sync first stores an encrypted `syncRemovalPending` marker beside the existing sync configuration. Normal sync, sync review, sync resolution, and new enrollment are blocked on the device performing cleanup while this marker exists. Remote cleanup can be retried using the retained encrypted configuration. Only after remote deletion succeeds does the core persist the final state that removes both the configuration and the marker.

This is intentionally local to the active device. The project assumes a single user operates one device at a time; it does not distribute a temporary cleanup marker to other registered devices.

### 2.3 Residual limitation

Remote deletion has an inherently ambiguous failure mode: a request can succeed remotely but fail to return a response. Retrying is therefore safe only when the sync provider treats deletion of already-missing remote objects as success. This is an explicit `SyncProviderPort` contract that every future adapter must implement.
