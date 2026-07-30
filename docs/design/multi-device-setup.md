# Multi-Device Setup

> The vault is local-first. Enrollment uses files or copied text and never
> requires both devices to be online at the same time.

## Device identity

Every trusted device owns two unrelated asymmetric key pairs:

- Ed25519 signs enrollment requests, trust transitions, and vault snapshots.
- ECDH P-256 opens vault-master-key envelopes addressed to that device.

The private keys are generated on their owning device and remain protected
there. The signed trust chain authenticates the device ID and both public keys.
Signing keys are never used for ECDH or encryption.

## Two-file enrollment exchange

Enrollment has three user movements:

1. Copy the vault ID and genesis-certificate digest shown by the registered
   device to the target, then create and export a public enrollment request.
2. Move the request to a registered device, approve it there, and export the
   enrollment response.
3. Move the response back to the target device and complete enrollment.

The devices do not connect to each other and need not be online simultaneously.

### 1. Target creates the request

The target device creates:

- a device ID;
- an Ed25519 signing pair;
- an ECDH P-256 vault-wrapping pair;
- a symmetric local-protection key;
- a unique request ID.

It self-signs a public request containing the request ID, vault ID, algorithm
suite, expected genesis-certificate digest, device ID, and both public keys.
Its private request state is encrypted locally with the master password and
retained under the request ID. The vault ID and genesis digest must come from
the registered device independently of the later response file. Together they
pin the intended vault trust root.

Only the signed public request is exported. It contains no private key, vault
master key, recovery material, or sync credential.

### 2. Registered device authorizes the request

The registered device:

1. verifies the request self-signature and algorithm suite;
2. rejects a request whose expected genesis digest does not match the vault;
3. shows fingerprints of both requested public keys for user confirmation;
4. adds the target identity to the signed trust chain;
5. creates a current-generation vault-key envelope for the target public
   wrapping key;
6. signs, persists, and—when sync is enabled—uploads the resulting snapshot.

The response contains the request ID, trust anchor, and encrypted signed
snapshot. It contains no target private key and no sync credential.

Authorization is idempotently refreshable. If the same request is presented
after its device is already trusted, the registered device compares both public
keys and verifies the current-generation envelope. It then returns the current
signed snapshot without another trust transition, local write, or upload. This
lets a target finish an outstanding enrollment after unrelated revocations.
A device ID that appeared earlier but is now revoked cannot be refreshed or
reused; the target must create a fresh request with fresh keys and a fresh
device ID.

### 3. Target completes enrollment

The target device decrypts its retained request state and verifies that the
response trust anchor has the genesis digest pinned by its request. It then
verifies the response identity, vault, trust chain, snapshot signer, and device
envelope. It opens its envelope with the retained ECDH private key and then
decrypts the vault. A trust anchor supplied only by the response is never
trusted on its own.

If the vault has a sync target, the user must enter S3 credentials on this
device. The provider adapter verifies that the credentials address the same
target and current remote snapshot. Credentials are encrypted using the
device-local protection key and are never copied from the registered device.

The target persists its access material, recovery backup, snapshot, trust
checkpoint, and encrypted local credential state as one initialization step.
Pending request state is removed only after that step succeeds.
If session activation fails after initialization, those new local vault records
are removed while the pending request remains available for a safe retry.

If the provider cannot confirm whether the completed snapshot upload succeeded,
local enrollment still completes and returns the recovery mnemonic with sync
upload marked pending. The next normal sync reconciles the signed local
snapshot. A definite remote compare-and-set rejection rolls local enrollment
back instead.

## Trust and key slots

Every snapshot has one vault-master-key envelope for every trusted identity and
no envelope for any untrusted identity. An envelope is bound to:

- vault ID;
- recipient device ID;
- vault-key generation;
- algorithm suite.

The snapshot metadata, slot, and envelope must all name the same generation and
recipient. Duplicate device IDs, signing keys, wrapping keys, or slot recipients
are rejected.

## Revocation and surviving devices

Revocation creates a fresh vault master key, increments its generation once,
and makes a fresh ECDH envelope for every survivor. The revoked identity and
slot are absent from the new snapshot. A surviving device opens its new
envelope with the private wrapping key it already owns; it is not re-enrolled.

For synchronized vaults, the user first creates a replacement S3 credential and
enters it on the revoking device. After the rotated snapshot is uploaded, the
user disables the old credential in AWS and verifies its rejection in the app.
Each survivor enters the latest replacement credential once before consuming
the complete removal-only suffix. It can skip multiple revocations: each signed
removal advances the vault-key generation once, and the final snapshot contains
an envelope for every remaining identity. Ordinary content changes that happen
after the removals use the normal sync review and resolution flow.

A revoked device may retain old local data and keys. The design does not
remotely wipe it. Security comes from withholding all current-generation
envelopes and disabling its old provider access.

## Recovery

The recovery backup protects the complete local key payload, including the
device's private signing key, private wrapping key, local-protection key, and
vault trust anchor. Recovery therefore restores an existing surviving identity.
It does not create a new trusted identity.

After revocation, a recovered copy of the revoked private key remains unable to
open the current snapshot because no envelope is addressed to it.

## Transfer guidance

Enrollment artifacts are public-key authenticated rather than bearer secrets,
but users should still transport them only between devices they control:

- compare displayed public-key fingerprints before approval;
- obtain the vault ID and genesis digest from the registered device separately
  from the response file;
- do not edit request or response files;
- remove temporary copies after enrollment;
- cancel the request if its retained local state or target device may be
  compromised;
- never include AWS secret keys, master passwords, recovery material, or
  private device keys in transported enrollment files.
