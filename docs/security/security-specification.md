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
- **Sync Credentials:** optional provider configuration and credentials stored inside the encrypted vault data, not in a standalone local credential blob.
- **Device Signing Key Pair:** Ed25519 (sign/verify).
- **Device Exchange Key Pair:** ECDH P-256 (derive secrets for per-device key slots).
- **Key Slot:** An encrypted copy of the Vault Key for a recipient.
- **Envelope:** Metadata + signature for provenance.

---

## 3. Cryptographic Parameters

### 3.0 Algorithm Suites (Architecture)

The system supports **named algorithm suites** — predefined, validated combinations of cryptographic primitives. Users may select from supported suites; arbitrary mixing of algorithms is not permitted.

| Suite ID   | Signing | Key Exchange | Symmetric   | KDF    | Key Wrap                |
| ---------- | ------- | ------------ | ----------- | ------ | ----------------------- |
| `suite-v1` | Ed25519 | ECDH P-256   | AES-256-GCM | PBKDF2 | AES-256-GCM (A256GCMKW) |

- **Default:** `suite-v1`
- The vault file format's `metadata.profileId` (§6.2) identifies the full crypto profile (algorithm suite + serialization suite).
- Implementations **MUST** reject unknown suite or algorithm identifiers.
- Future suites (e.g., post-quantum) can be added without breaking existing vaults. Devices resolve processing rules from `profileId`.

The parameters below define `suite-v1`.

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

### 3.4 Key Wrapping (Key Lock)

- Algorithm: AES-256-GCM (A256GCMKW per RFC 7518 §4.7)
- IV: 12 random bytes, unique per wrap operation
- Tag length: 128 bits
- Output format: `IV (12 bytes) || ciphertext+tag`

### 3.5 Signing (Identity)

- Algorithm: Ed25519 (EdDSA on Curve25519)
- Signature encoding: **raw** 64 bytes
- Canonicalization: JCS (RFC 8785)

### 3.6 Exchange (Device Sharing) — Hardened

- Algorithm: ECDH P-256
- **Derivation Rule:** You **MUST** use **Concat KDF** (NIST SP 800-56A) or **HKDF** on the shared secret.
- **Prohibited:** Do NOT use the raw bits from `deriveBits` directly as an AES key.

---

## 4. Key Material & WebCrypto Constraints

### 4.1 Two device key pairs are mandatory

Each device generates:

1.  `deviceSignKeyPair`: Ed25519
2.  `deviceEcdhKeyPair`: ECDH P-256

### 4.2 Extractability rules

- At runtime, all sensitive keys **must be non-extractable**:
  - unwrapped device private keys: `extractable: false`
  - unwrapped Vault Key: `extractable: false`

---

## 5. Key Slot Algorithms

### 5.1 Slot Types

1.  **Device Slot (ECDH-ES+A256GCMKW)**
2.  **Secret Key Slot (A256GCMKW)**

### 5.2 ECDH-ES+A256GCMKW Derivation (Hardened)

To wrap the Vault Key for a device:

1.  Compute ECDH shared secret `Z` (Ephem Priv + Device Pub).
2.  Derive `KEK` using **Concat KDF** (SHA-256):
    - `AlgorithmID` = "A256GCMKW"
    - `PartyUInfo` = `apu`
    - `PartyVInfo` = `apv`
    - **Constraint:** Output must be exactly 256 bits.
3.  Wrap Vault Key with `KEK` (AES-256-GCM).

---

## 6. File Format ("Signed Envelope", Canonicalized)

### 6.1 Encoding rules

- Binary: base64url (no padding)
- Strings: UTF-8
- Canonicalization: RFC 8785 JCS

### 6.2 Top-level schema

```json
{
  "version": 1,
  "metadata": {
    "profileId": "profile-v1"
  },

  "envelope": {
    "vaultId": "b64url(16+ bytes random)",
    "signerDeviceId": "device_uuid",
    "revision": 1,
    "timestamp": 1700000000000,
    "signature": "b64url(raw_ed25519_sig_64_bytes)"
  },

  "payload": {
    "keySlots": [
      {
        "type": "device",
        "deviceId": "device_uuid_123",
        "epk": {
          "format": "spki",
          "data": "b64url(ephemeral_public_key_bytes)"
        },
        "apu": "b64url(bytes)",
        "apv": "b64url(bytes)",
        "ciphertext": "b64url(iv_12_bytes || aes_gcm_wrapped_vault_key+tag)"
      },
      {
        "type": "secret-key",
        "deviceId": "secret_key",
        "ciphertext": "b64url(iv_12_bytes || aes_gcm_wrapped_vault_key+tag)"
      }
    ],

    "data": {
      "nonce": "b64url(12 bytes)",
      "ciphertext": "b64url(aes_gcm_ciphertext||tag)"
    }
  }
}
```

### 6.3 AES-GCM AAD (Authenticated Data)

Compute:

```javascript
aadObject = {
  version,
  metadata: { profileId },
  envelope: { vaultId, signerDeviceId, revision, timestamp },
  keySlotsDigest,
};
AAD = UTF8(JCS(aadObject));
```

AES-GCM encryption MUST use this AAD to prevent metadata tampering.

---

## 7. Local Persistence & Memory Hygiene

### 7.1 Local Storage (Hostile Disk)

IndexedDB is the **primary vault storage**. Cloud sync (S3) is optional.

IndexedDB stores:

- `vault` singleton record:
  - `vaultId`
  - `profileId` (crypto profile used for this snapshot)
  - `data` (serialized encrypted snapshot bytes)
  - encrypted vault payload includes password entries, device registry, and optional sync provider configuration/credentials
  - `lastModified`
  - `lastSyncTimestamp` (nullable)
- `deviceState` singleton record:
  - `deviceId`, `deviceName`, `vaultId`
  - `salt` (32-byte PBKDF2 salt)
  - `wrappedDeviceKeys`:
    - `wrappedSigningPrivateKey`
    - `wrappedAgreementPrivateKey`
    - `signingPublicKeyBytes`
    - `agreementPublicKeyBytes`
  - `createdAt`, `lastSyncTimestamp` (nullable)
- `pendingSync` queue records:
  - `id`, `operation`, `entryId`, `timestamp`, `retryCount`

### 7.1.1 Sync Credential Storage Model

Cloud sync uses user-provided, prefix-scoped S3 access keys instead of
service-issued temporary credentials. This is an explicit local-first tradeoff:
the project does not operate a backend that can safely issue refresh tokens,
exchange Cognito identities, or revoke provider credentials on the user's
behalf.

Sync provider configuration and credentials are stored as encrypted vault data.
There is no standalone `syncConfig` IndexedDB record and no dedicated
master-password-derived sync-credential protection key. After the local vault is
unlocked, decrypting the vault payload makes the sync credentials available in
the unlocked vault session. While the vault is locked, sync cannot authenticate
to S3.

This matches the local-first bootstrap rule: every device must first obtain and
unlock a local encrypted vault snapshot. Sync is then an optional operation
performed from that unlocked state. Temporary S3 credentials would not remove the
extension-side storage problem; while the vault is unlocked, any temporary
credential would live in the same runtime trust boundary as the unlocked vault
state. A refresh flow would also require another long-lived authority, adding
complexity without strengthening the local-only threat model.

The security boundary is therefore:

- the vault remains encrypted and signed before it reaches S3
- sync credentials are encrypted by the Vault Key as part of the vault payload
- sync credentials are available only after local vault unlock
- the S3 key is scoped to the configured object prefix
- the configured prefix is treated as one user's sync namespace, not a
  multi-tenant storage area
- all devices holding the same S3 key have equivalent storage access under that
  prefix
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
3.  **Generation:** Create VaultKey, DeviceKeys.
4.  **Secret Key:** Generate random 256-bit secret key, display to user (save offline). Wrap VaultKey with secret key → secret key slot. `secureWipe(secretKey)`. The secret key is used for disaster recovery and vault access on a new device.
5.  **Persistence:** Wrap Device Keys with MasterKEK → Store in IndexedDB.
6.  **Sync Configuration:** If sync is enabled, validate the provider configuration and store it inside the vault payload before encryption.
7.  **Genesis Save:** Encrypt, sign, save locally, and upload if sync is enabled.

### 8.2 Login (Unlock)

1.  **Input:** User enters Password.
2.  **Derive:** Re-compute MasterKEK from password and stored salt.
3.  **Unwrap Identity:** Unwrap Device Keys from IndexedDB.
4.  **Load Local Snapshot:** Read the local encrypted vault snapshot from IndexedDB.
5.  **Verify:** Verify Ed25519 signature on the local snapshot.
6.  **Rollback Check:** If `vault.timestamp < local.lastSeenTimestamp`, warn user.
7.  **Decrypt:** Unwrap Vault Key via device key slot (ECDH) → decrypt data. Secret key slot is used for disaster recovery and new-device vault access.
8.  **Enable Sync:** If the decrypted vault contains sync credentials and sync is enabled, authenticated S3 sync may run from the unlocked session.
9.  **Wipe:** `passwordBuffer.fill(0)` immediately.

### 8.3 Safe Save (Debounced)

- **Debounce:** Wait 1s.
- **Encrypt:** Generate NEW random 12-byte IV.
- **Commit:** Increment revision, update timestamp.
- **Sign:** Sign updated file with device Ed25519 key.
- **Persist:** Write to IndexedDB (and sync to S3).

### 8.4 Device Revocation

1.  **Rotate:** Generate NEW Vault Key.
2.  **Re-Encrypt:** Encrypt data with New Key.
3.  **Re-Slot:** Create new slots for only trusted devices.
4.  **Commit:** Increment revision, sign, upload.

### 8.5 Device Enrollment

A new device joins the vault using bootstrap material created by an already trusted device. The user needs: enrollment package + encrypted vault snapshot transfer + one-time enrollment secret + master password + secret key.

1.  **Create Package:** Trusted device creates enrollment package containing vault id, trusted public device keys, and an encrypted vault snapshot source descriptor (external file or short-lived URL) with expected digest. Plaintext sync credentials and full vault snapshot bytes are not included; sync credentials remain encrypted inside the vault snapshot.
2.  **Protect Package:** Enrollment package is encrypted with a random one-time enrollment secret and transferred to the user.
3.  **Instruct User:** Registered device shows handling guidance: use only trusted personal devices/channels, keep package and enrollment secret separate when possible, do not paste enrollment material into public/shared/AI tools, delete temporary copies after enrollment, and cancel enrollment if exposure is suspected.
4.  **Import Package:** User provides enrollment package + one-time enrollment secret on the new device.
5.  **Decrypt Package:** New device decrypts and verifies enrollment package.
6.  **Acquire Snapshot:** User imports the separate encrypted vault snapshot file, or the new device fetches it from the short-lived URL in the package.
7.  **Verify Snapshot Digest:** Hash the encrypted snapshot bytes and compare against the digest from the enrollment package.
8.  **Persist Bootstrap Snapshot:** Store the encrypted vault snapshot locally in IndexedDB as the device's starting local vault copy.
9.  **Input:** User enters master password + secret key.
10. **Verify:** Verify envelope signature against trusted public device keys from the enrollment package.
11. **Unwrap:** Unwrap VaultKey from secret key slot (A256GCMKW).
12. **Decrypt:** Decrypt local vault data; sync credentials become available from the unlocked vault if sync is configured.
13. **Generate:** Generate device keys (Ed25519 + ECDH P-256).
14. **Create Slot:** Create own ECDH device key slot (wrapping VaultKey).
15. **Register:** Add self to device registry in vault data.
16. **Derive:** Derive MasterKEK from password → wrap device private keys for local device access.
17. **Optional Refresh:** If sync is configured, download the latest remote snapshot using credentials from the unlocked vault and resolve freshness/conflicts before upload.
18. **Sign:** Sign updated envelope (Ed25519).
19. **Upload:** Upload updated vault to S3 if sync is configured.
20. **Persist:** Store wrapped keys + device state + updated encrypted vault snapshot in IndexedDB.
21. **Wipe:** `secureWipe(secretKey, passwordBuffer, enrollmentSecretBuffer)`.

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
- [ ] **KDF Safety (NEW):** ECDH raw key bits are never used directly. They must pass through HKDF or ConcatKDF to derive the actual AES key.

### Runtime Security

- [ ] **Non-Extractable:** The Vault Key and unwrapped Device Private Keys are marked `extractable: false` in WebCrypto.
- [ ] **Memory Wiping (Hardened):** On logout/lock, all Uint8Array buffers holding keys or passwords are explicitly overwritten with `.fill(0)` before references are dropped.
- [ ] **Auto-Lock:** Inactivity timer (default 5 min) triggers the memory wiping flow.

### Data Format & Integrity

- [ ] **AAD Binding:** AES-GCM decryption MUST verify the envelope metadata (signerId, timestamp) as Additional Authenticated Data (AAD).
- [ ] **Canonical Signing:** Ed25519 signatures are computed over Canonical JSON (JCS) bytes to ensure deterministic verification.
- [ ] **Slot Structure:** ECDH Key Slots include `epk`, `apu`, and `apv` parameters and use standard Concat KDF derivation.

### Logic & Flow

- [ ] **Revision Monotonicity:** Every "Safe Save" operation increments the revision counter and updates the timestamp.
- [ ] **Rollback Warning:** The app warns the user if the loaded vault's timestamp is older than the last locally seen timestamp.
- [ ] **Signature Verification:** The app rejects any vault where the Ed25519 signature does not match the signerId public key.
- [ ] **Sync Credential Boundary:** Sync credentials are stored only inside encrypted vault data and are usable only after local vault unlock.

### Platform Security

- [ ] **Strict CSP:** manifest.json contains `"content_security_policy": { "extension_pages": "script-src 'self'; object-src 'none';" }`.
- [ ] **No Remote Code:** No usage of `eval()`, `new Function()`, or remotely hosted script files.

---
