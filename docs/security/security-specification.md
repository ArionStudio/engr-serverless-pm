# Serverless Zero-Knowledge Password Manager (Browser Extension) — Security Spec (v1.0)

## 0. Summary

A serverless password manager where **confidentiality and tamper-detection** are enforced cryptographically in a **hostile storage** environment (S3 + IndexedDB assumed readable/writable by an attacker). Only the **volatile RAM** of the running extension is trusted.

---

## 1. Threat Model & Security Goals

### 1.1 Assumptions

- S3 objects and IndexedDB are **public and attacker-modifiable** (read/write/rollback/delete).
- Attacker can perform **offline brute-force attacks** on the stored vaults.
- Only **RAM of the currently running extension instance** is trusted.

### 1.2 Goals

- **Confidentiality:** attacker cannot learn secrets from S3/IndexedDB.
- **Tamper detection:** modifications of encrypted payload are detected (decrypt fails).
- **Access control:** only authorized devices (or master password holder) can obtain the Vault Key.
- **Resilience:** Mitigation of offline brute-force attacks via a strong master password, unique salt, and a high-cost KDF.

---

## 2. Terminology

- **Vault Key (DEK):** AES-256-GCM key encrypting the vault data.
- **Master KEK:** PBKDF2-derived key (master password + salt) used to wrap private keys.
- **Sync Target:** non-secret provider namespace stored in the encrypted vault.
- **Sync Credentials:** provider secrets encrypted separately on each device
  using that device's local-protection key.
- **Device Signing Key Pair:** Ed25519 (sign/verify).
- **Device Vault Key Pair:** ECDH P-256 (open recipient-specific vault-key
  envelopes).
- **Key Slot:** An encrypted copy of the Vault Key for a recipient.
- **Envelope:** Metadata + signature for provenance.

---

## 3. Cryptographic Parameters

### 3.0 Algorithm Suites (Architecture)

The system uses a named algorithm suite: a predefined, validated combination of
cryptographic primitives. Arbitrary mixing of algorithms is not permitted.

| Suite ID | Signing | Key agreement | Envelope KDF | Encryption  |
| -------- | ------- | ------------- | ------------ | ----------- |
| `spm-v1` | Ed25519 | ECDH P-256    | HKDF-SHA-256 | AES-256-GCM |

- **Current:** `spm-v1`
- Snapshot `metadata.algorithmSuiteId` identifies the suite.
- Implementations **MUST** reject unknown suite or algorithm identifiers.
- `spm-v1` also defines PBKDF2-HMAC-SHA-256 for master-password protection,
  AES-256-GCM for vault content, and AES-256-GCM for local sync credentials.

### 3.1 Randomness

- Use `crypto.getRandomValues()` for all:
  - salts (>= 32 bytes required)
  - IVs (12 bytes for AES-GCM)
  - generated symmetric keys
  - device IDs

### 3.2 PBKDF2 (Master KEK) — Hardened

- Algorithm: PBKDF2 with HMAC-SHA-256
- Iterations: **600,000**
- Salt: random, **32 bytes minimum**
- Input to PBKDF2 is the UTF-8 encoded master password.

### 3.2.1 Master Password Requirements

- **Minimum requirement:** at least **12 characters**.
- **Recommended requirement:** at least **16 characters**, or a passphrase of **5 or more random words**.
- **Uniqueness:** the master password **MUST NOT** be reused from any other site, app, or account.
- **Rationale:** in this serverless, client-side, open-source design there is no server-held secret protecting the vault. Resistance to offline guessing depends primarily on the password strength, the random salt, and the PBKDF2 cost factor.

### 3.3 Payload Encryption (Data Lock)

- Algorithm: AES-256-GCM
- IV: 12 random bytes, **must be unique per encryption**
- Tag length: 128 bits
- AAD: Defined in §6.3 (Must bind Envelope metadata)

### 3.4 Vault-Key Envelopes

- Algorithm: custom AES-256-GCM key wrapping with the authenticated context
  defined below
- IV: 12 random bytes, unique per wrap operation
- Tag length: 128 bits
- A fresh ephemeral ECDH P-256 pair and HKDF salt are generated per recipient.
- HKDF-SHA-256 derives a 256-bit wrapping key from the ECDH shared secret.
- AAD binds the vault ID, recipient device ID, vault-key generation, and
  algorithm suite ID.

### 3.5 Signing (Identity)

- Algorithm: Ed25519 (EdDSA on Curve25519)
- Signature encoding: **raw** 64 bytes
- Canonicalization: JCS (RFC 8785)

### 3.6 Exchange (Device Sharing) — Hardened

- Algorithm: ECDH P-256
- **Derivation Rule:** use HKDF-SHA-256 on the shared secret.
- **Prohibited:** Do NOT use the raw bits from `deriveBits` directly as an AES key.

---

## 4. Key Material & WebCrypto Constraints

### 4.1 Two device key pairs are mandatory

Each device generates:

1.  `deviceSignKeyPair`: Ed25519
2.  `deviceVaultKeyPair`: ECDH P-256

The signed trust identity authenticates both public keys. Signing keys are never
reused for key agreement or encryption.

### 4.2 Extractability rules

- At runtime, all sensitive keys **must be non-extractable**:
  - unwrapped device private keys: `extractable: false`
  - unwrapped Vault Key: `extractable: false`

---

## 5. Key Slot Algorithms

### 5.1 Device slots

Every trusted identity has exactly one device slot at the snapshot's current
vault-key generation. Untrusted identities have no slot.

Every signed trust certificate also records the vault-key generation. Genesis
uses generation 1. Enrollment preserves it. A removal transition increments it
exactly once. Empty transitions, combined additions and removals, key changes
for surviving identities, and self-removal by the authorizer are rejected.
Snapshot metadata must match the generation authenticated by the final trust
certificate. A device ID that appeared in an earlier certificate cannot be
enrolled again after removal.

### 5.2 ECDH + HKDF + AES-GCM derivation

To wrap the Vault Key for a device:

1.  Compute ECDH shared secret `Z` (Ephem Priv + Device Pub).
2.  Derive a 256-bit wrapping key with HKDF-SHA-256 using a fresh random salt
    and suite-defined info.
3.  Wrap Vault Key with `KEK` (AES-256-GCM).
4.  Authenticate the vault ID, recipient device ID, vault-key generation, and
    `spm-v1` suite ID as AAD.

A fresh ephemeral ECDH key is generated for every recipient envelope.

---

## 6. File Format ("Signed Envelope", Canonicalized)

### 6.1 Encoding rules

- Binary: base64url (no padding)
- Strings: UTF-8
- Canonicalization: RFC 8785 JCS

### 6.2 Top-level schema

```json
{
  "metadata": {
    "schemaVersion": 1,
    "algorithmSuiteId": "spm-v1",
    "id": "vault-id",
    "createdByDeviceId": "device-id",
    "vaultKeyGeneration": 3,
    "snapshotVersionVector": { "device-id": 8 }
  },
  "keySlots": {
    "deviceSlots": [
      {
        "deviceId": "device-id",
        "vaultKeyGeneration": 3,
        "envelope": {
          "recipientDeviceId": "device-id",
          "vaultKeyGeneration": 3,
          "ephemeralPublicKey": "b64url(...)",
          "hkdfSalt": "b64url(...)",
          "encryptedVaultMasterKey": {
            "encryptionNonce": "b64url(12 bytes)",
            "ciphertext": "b64url(ciphertext and tag)"
          }
        }
      }
    ]
  },
  "trustChain": { "certificates": [] },
  "content": {
    "encryptionNonce": "b64url(12 bytes)",
    "ciphertext": "b64url(ciphertext and tag)"
  },
  "signature": { "signature": "b64url(raw Ed25519 signature)" }
}
```

### 6.3 AES-GCM AAD (Authenticated Data)

Compute:

```javascript
envelopeAad = JCS({
  vaultId,
  deviceId,
  vaultKeyGeneration,
  algorithmSuiteId,
});
```

Vault-content, envelope, pending-enrollment, session, and local-credential
encryption each use a suite-defined AAD context. Contexts are not interchangeable.

---

## 7. Local Persistence & Memory Hygiene

### 7.1 Local Storage (Hostile Disk)

IndexedDB is the **primary vault storage**. Cloud sync (S3) is optional.

IndexedDB stores:

- `vault` singleton record:
  - `vaultId`
  - `algorithmSuiteId`
  - `data` (serialized encrypted snapshot bytes)
  - encrypted vault payload includes password entries, device registry, and an
    optional non-secret sync target
  - `lastModified`
  - `lastSyncTimestamp` (nullable)
- `deviceState` singleton record:
  - `deviceId`, `deviceName`, `vaultId`
  - `salt` (32-byte PBKDF2 salt)
  - `wrappedDeviceKeys`:
    - `wrappedSigningPrivateKey`
    - `wrappedVaultPrivateKey`
    - `wrappedLocalProtectionKey`
    - `signingPublicKeyBytes`
    - `vaultPublicKeyBytes`
  - `createdAt`, `lastSyncTimestamp` (nullable)
- `pendingSync` queue records:
  - `id`, `operation`, `entryId`, `timestamp`, `retryCount`

### 7.1.1 Sync Credential Storage Model

Cloud sync uses user-provided, prefix-scoped S3 access keys instead of
service-issued temporary credentials. This is an explicit local-first tradeoff:
the project does not operate a backend that can safely issue refresh tokens,
exchange Cognito identities, or revoke provider credentials on the user's
behalf.

The encrypted shared vault stores only the provider and non-secret target
configuration. Every device stores its credential in a separate local encrypted
record. A device-local symmetric key protects that record, and AAD binds it to
the vault ID, local device ID, provider, and canonical target.

The security boundary is therefore:

- the vault remains encrypted and signed before it reaches S3
- sync credentials never occur in shared snapshots or enrollment artifacts
- local credentials are available only after local vault unlock
- the S3 key is scoped to the configured object prefix
- the configured prefix is treated as one user's sync namespace, not a
  multi-tenant storage area
- devices may use the same user-created S3 key, but the user enters it separately
  and each device encrypts its own local copy
- rotation and revocation happen in the user's AWS account by replacing,
  disabling, or deleting the IAM access key

### 7.2 Device Location History

Each device records its location on every unlock/sync operation, appending to its own `locationHistory` array in the device registry (inside the encrypted vault data).

- **Detection strategy:**
  1. **Primary:** Browser Geolocation API (`navigator.geolocation`) — requires user consent
  2. **Fallback:** IP geolocation (`ipinfo.io/json`)
  3. **Decline both:** No location recorded for that session

- **Storage:** Unlimited entries (encrypted inside vault, no pruning)
- **Purpose:** User recognition only — allows users to verify "was this access from me?" Not used for security enforcement.
- **New device detection:** On sync download, diff local vs remote `deviceRegistry.devices`. If new `deviceId`s appear, show notification with device name, environment info, and registration location.

### 7.3 Memory Wiping (Critical) — New

Since JS Garbage Collection is unpredictable:

- **TypedArrays:** Use Uint8Array for all keys/passwords (avoid Strings).
- **Overwrite:** Immediately after use (or on logout), execute `buffer.fill(0)` on the array.
- **Release:** Set references to `null` after filling.

---

## 8. Workflows

### 8.1 Setup (Genesis)

1.  **Strength Check:** Enforce the minimum master-password policy and warn when the password does not meet the recommended strength guidance.
2.  **Derivation:** MasterKEK = PBKDF2(Password, Salt, 600k).
3.  **Generation:** Create the initial Vault Key, Ed25519 pair, ECDH P-256
    pair, and device-local protection key.
4.  **Envelope:** Create vault-key generation 1 and one envelope for the genesis
    device.
5.  **Recovery:** Protect the complete local key payload in the recovery backup.
6.  **Persistence:** Protect local key material with the MasterKEK and save it
    atomically with the signed snapshot and trust checkpoint.
7.  **Sync Configuration:** If sync is enabled, store the target in the vault
    and credentials only in device-local encrypted state.

### 8.2 Login (Unlock)

1.  **Input:** User enters Password.
2.  **Derive:** Re-compute MasterKEK from password and stored salt.
3.  **Unwrap Identity:** Unwrap Device Keys from IndexedDB.
4.  **Load Local Snapshot:** Read the local encrypted vault snapshot from IndexedDB.
5.  **Verify:** Verify Ed25519 signature on the local snapshot.
6.  **Rollback Check:** If `vault.timestamp < local.lastSeenTimestamp`, warn user.
7.  **Decrypt:** Find the current-generation device envelope, validate its
    context, open it with the device's private ECDH key, and decrypt the vault.
8.  **Enable Sync:** If the decrypted vault contains a target, decrypt the
    matching device-local credential before provider access.
9.  **Wipe:** `passwordBuffer.fill(0)` immediately.

### 8.3 Safe Save (Debounced)

- **Debounce:** Wait 1s.
- **Encrypt:** Generate NEW random 12-byte IV.
- **Commit:** Increment revision, update timestamp.
- **Sign:** Sign updated file with device Ed25519 key.
- **Persist:** Write to IndexedDB (and sync to S3).

### 8.4 Device Revocation

1.  **Preflight:** Require exact local/remote agreement and, for a synced vault,
    validate a replacement credential for the same target. Before provider
    access, require the revoked identity to have either one active profile and
    no tombstone or no profile state yet while enrollment is pending.
2.  **Stage Credential:** Encrypt the replacement locally while retaining the
    old credential for rollback and external-disable verification.
3.  **Rotate:** Generate a fresh Vault Key and increment its generation once.
4.  **Re-Encrypt:** Encrypt data with the fresh key.
5.  **Re-Slot:** Create a fresh ephemeral ECDH envelope for each survivor and no
    envelope for the revoked identity.
6.  **Commit:** Append the removal-only trust transition, sign, atomically
    persist the snapshot, checkpoint, and local credential transition with
    local compare-and-set, and upload with remote compare-and-set.
7.  **External Completion:** The user disables the old AWS credential. Core
    reports completion only after the provider rejects it.

The encrypted signed vault stores a non-secret pending marker with the revoked
device IDs and vault-key generation. Provider credentials remain exclusively in
encrypted device-local state. Enrollment, another revocation, and sync removal
are blocked on every device until a matching local old credential is rejected
and the signed marker removal is uploaded. Generic sync accepts marker removal
only; it rejects marker creation or replacement outside the revocation flow.
Verified revocation and enrollment consumption may replace or clear a stale
local marker when the signed remote trust state has advanced. A locally retained
previous credential blocks another revocation while it remains accepted by the
provider, but provider rejection allows the verified newer revocation to
replace it with the next credential-rotation state.

An offline survivor validates the complete signed suffix after its local trust
certificate. Every suffix certificate must either add exactly one identity
while preserving the vault-key generation or remove exactly one identity while
incrementing it once. All surviving public keys and each transition authorizer
must remain trusted. A revocation-consumption suffix must contain at least one
removal; its prepared result also reports any enrolled identities encountered
before or between removals.

The survivor first prepares a normal sync review. Revoked profiles and final
active profiles for newly enrolled survivors form a mandatory baseline and
cannot be undone by a resolution. Later entry, tag, and surviving-profile
changes use the ordinary review and resolution model.
An identity pending in the local vault may have no final profile state or one
final tombstone when revoked. The tombstone represents a device that completed
enrollment and was revoked between the survivor's observed snapshots; it is
mandatory authenticated revocation state rather than a user-selectable change.
Across the final vault, a trusted identity may have one active profile or no
profile while pending, but never a tombstone. An untrusted identity may not
remain active, duplicate active or deleted profile records are invalid, and a
tombstone must refer to an identity present in signed trust-chain history.
Apply downloads and verifies the candidate again before persisting or uploading
anything.

### 8.5 Device Enrollment

A new device joins through a two-file, asynchronous exchange:

1.  **Pin Root:** The target receives the vault ID and genesis-certificate
    digest from the registered device independently of the response file.
2.  **Target Request:** The target creates both key pairs and a local-protection
    key, self-signs a request containing its identity, public keys, and expected
    genesis digest, and stores the private request state encrypted under the
    master password.
3.  **Authorize:** A registered device verifies the self-signature and pinned
    genesis digest, presents public-key fingerprints, adds the identity to the
    trust chain, creates a current-generation envelope for it, and returns the
    signed encrypted snapshot with the trust anchor.
    Re-presenting a request for an already-current identity with matching keys
    returns the latest snapshot without another transition. A previously
    revoked device ID, signing key, or wrapping key is never refreshed or
    enrolled again.
4.  **Complete:** Before trusting the returned chain, the target requires its
    trust anchor to match the genesis digest pinned by the request. It then
    verifies all remaining request/response bindings, trust descent, signer,
    and envelope context and opens the envelope with its retained private
    wrapping key.
5.  **Local Sync Access:** If a sync target exists, the user enters credentials
    on the target. They must address the same target and snapshot and are stored
    only in encrypted local state.
6.  **Persistence:** Access material, recovery backup, snapshot, checkpoint, and
    optional local credentials are initialized together. Pending request state
    is removed only after success. If session activation fails, the initialized
    local records are removed and the pending request remains retryable. A
    later remote compare-and-set rollback may remove those records only while
    both the active session version and persisted snapshot digest still match
    the enrollment snapshot.

The devices never need to be connected simultaneously. Neither transported
artifact contains private device keys or provider credentials.

An indeterminate completion-upload result preserves local enrollment and
returns the recovery mnemonic with sync marked pending. A later normal sync can
reconcile the signed local snapshot. Only a definite remote compare-and-set
rejection rolls local enrollment back.

An already-enrolled survivor advances through a separate verified
enrollment-consumption flow. Every skipped certificate must add exactly one
identity and remove none, preserve the vault-key generation and all existing
public identities, and have a matching added device envelope. Existing
envelopes cannot change. A completed target's active profile is mandatory and a
tombstone for a newly trusted identity is rejected. Other ordinary vault
changes accompanying the enrollment use the normal prepare/apply review.

---

## 9. Anti-Rollback & Replay Handling

- **AES-GCM:** Prevents modification of ciphertext.
- **Ed25519:** Proves authorship.
- **Timestamp Check:** Extension MUST compare `vault.timestamp` against the last locally seen timestamp. If remote is older, warn the user (Potential Replay Attack).

---

## 10. Runtime Safeguards

### 10.1 Key handling in RAM

Keep only unwrapped keys (`extractable:false`) and decrypted state.

### 10.2 Memory wiping (Hardened)

**Rule:** Any Uint8Array holding password material or raw key bits must be overwritten with `.fill(0)` before scope exit.

### 10.3 Auto-lock

Inactivity timer (5 min) triggers memory wipe.

---

## 11. CSP (MV3 extension pages)

Strict CSP required in manifest.json:

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none';"
  }
}
```

---

## 12. Implementation Checklist (Must Pass)

### Cryptographic Primitives

- [ ] **Dual Key Pairs:** Every device generates two distinct pairs: Ed25519 (Identity) and ECDH P-256 (Key Exchange).
- [ ] **IV Uniqueness:** All AES-GCM operations use a fresh, random 12-byte IV. Never reuse an IV for the same key.
- [ ] **Salt Strength:** All salts are random and >= 32 bytes (upgraded from 16 bytes).
- [ ] **Master Password Policy:** Enforce the documented minimum length and present the recommended stronger passphrase guidance during setup.
- [ ] **KDF Safety:** ECDH raw key bits are never used directly. HKDF-SHA-256
      derives the AES-256 wrapping key.
- [ ] **Ephemeral Envelopes:** Every recipient envelope uses a fresh ephemeral
      ECDH pair, HKDF salt, and AES-GCM nonce.

### Runtime Security

- [ ] **Non-Extractable:** The Vault Key and unwrapped Device Private Keys are marked `extractable: false` in WebCrypto.
- [ ] **Memory Wiping (Hardened):** On logout/lock, all Uint8Array buffers holding keys or passwords are explicitly overwritten with `.fill(0)` before references are dropped.
- [ ] **Auto-Lock:** Inactivity timer (default 5 min) triggers the memory wiping flow.

### Data Format & Integrity

- [ ] **AAD Binding:** AES-GCM decryption MUST verify the envelope metadata (signerId, timestamp) as Additional Authenticated Data (AAD).
- [ ] **Canonical Signing:** Ed25519 signatures are computed over Canonical JSON (JCS) bytes to ensure deterministic verification.
- [ ] **Slot Structure:** Exactly one current-generation envelope exists per
      trusted identity, with matching recipient and authenticated context.

### Logic & Flow

- [ ] **Revision Monotonicity:** Every "Safe Save" operation increments the revision counter and updates the timestamp.
- [ ] **Rollback Warning:** The app warns the user if the loaded vault's timestamp is older than the last locally seen timestamp.
- [ ] **Signature Verification:** The app rejects any vault where the Ed25519 signature does not match the signerId public key.
- [ ] **Sync Credential Boundary:** Sync credentials are absent from shared
      snapshots and enrollment artifacts and exist only in context-bound local
      ciphertext.
- [ ] **Revocation Consumption:** Trust/key-slot changes are rejected by generic
      sync and accepted only through the verified dedicated device-trust flow.
- [ ] **Provider Completion:** Old provider access is not reported revoked until
      the provider rejects the previous credential.

### Platform Security

- [ ] **Strict CSP:** manifest.json contains `"content_security_policy": { "extension_pages": "script-src 'self'; object-src 'none';" }`.
- [ ] **No Remote Code:** No usage of `eval()`, `new Function()`, or remotely hosted script files.

---
