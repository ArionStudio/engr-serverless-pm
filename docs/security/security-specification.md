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
- **Resilience:** Mitigation of offline brute-force attacks via "Peppering".

---

## 2. Terminology

- **Vault Key (DEK):** AES-256-GCM key encrypting the vault data.
- **Master KEK:** PBKDF2-derived key (Password + Salt + **Pepper**) used to wrap private keys.
- **Pepper:** A high-entropy application-secret (baked into build or separate config) used to mitigate offline attacks.
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
- The vault file format's `alg` fields (§6.2) identify which suite was used, enabling forward-compatible algorithm changes.
- Implementations **MUST** reject unknown suite or algorithm identifiers.
- Future suites (e.g., post-quantum) can be added without breaking existing vaults — each device reads the `alg` field to determine how to process each key slot.

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
- **Pepper Strategy (NEW):**
  - Input to PBKDF2 is `SHA256(MasterPassword + ApplicationPepper)`.
  - _Rationale:_ Prevents an attacker who steals the S3 database from cracking passwords without also reverse-engineering the extension code.

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

  "envelope": {
    "vaultId": "b64url(16+ bytes random)",
    "signerDeviceId": "device_uuid",
    "revision": 1,
    "timestamp": 1700000000,
    "signature": "b64url(raw_ed25519_sig_64_bytes)"
  },

  "payload": {
    "keySlots": [
      {
        "type": "device",
        "deviceId": "device_uuid_123",
        "alg": "ECDH-ES+A256GCMKW",
        "epk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
        "apu": "b64url(bytes)",
        "apv": "b64url(bytes)",
        "ciphertext": "b64url(iv_12_bytes || aes_gcm_wrapped_vault_key+tag)"
      },
      {
        "type": "secret-key",
        "deviceId": "secret_key",
        "alg": "A256GCMKW",
        "ciphertext": "b64url(iv_12_bytes || aes_gcm_wrapped_vault_key+tag)"
      }
    ],

    "data": {
      "alg": "A256GCM",
      "iv": "b64url(12 bytes)",
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

- `encryptedVault` (AES-256-GCM encrypted vault data)
- `wrappedDeviceSignKey` (Wrapped with MasterKEK)
- `wrappedDeviceEcdhKey` (Wrapped with MasterKEK)
- `salt` (32-byte PBKDF2 salt)
- `deviceId` (This device's UUID)
- `lastSyncTimestamp` (if sync enabled)
- `pendingSyncQueue` (if sync enabled, for offline changes)

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

1.  **Strength Check:** Validate Password Entropy & Pwned List.
2.  **Derivation:** MasterKEK = PBKDF2(Hash(Password + Pepper), Salt, 600k).
3.  **Generation:** Create VaultKey, DeviceKeys.
4.  **Secret Key:** Generate random 256-bit secret key, display to user (save offline). Wrap VaultKey with secret key → secret key slot. `secureWipe(secretKey)`. The secret key is used for both device enrollment and disaster recovery.
5.  **Persistence:** Wrap Device Keys with MasterKEK → Store in IndexedDB.
6.  **Genesis Save:** Encrypt, Sign, Upload.

### 8.2 Login (Unlock)

1.  **Input:** User enters Password.
2.  **Derive:** Re-compute MasterKEK (using Pepper).
3.  **Unwrap Identity:** Unwrap Device Keys from IndexedDB.
4.  **Download & Verify:** Fetch Vault. Verify Ed25519 signature.
5.  **Rollback Check:** If `vault.timestamp < local.lastSeenTimestamp`, Warn User.
6.  **Decrypt:** Unwrap Vault Key via device key slot (ECDH) → Decrypt Data. Secret key slot is used for device enrollment and disaster recovery (all devices lost).
7.  **Wipe:** `passwordBuffer.fill(0)` immediately.

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

### 8.5 Device Enrollment (Self-Registration)

A new device can join the vault without any involvement from existing devices. The user needs: master password (memorized) + secret key (paper backup) + cloud config.

1.  **Cloud Config:** User provides cloud provider config (QR code / config file / manual entry).
2.  **Input:** User enters master password + secret key.
3.  **Download:** Download vault from S3.
4.  **Verify:** Verify envelope signature (Ed25519).
5.  **Unwrap:** Unwrap VaultKey from secret key slot (A256GCMKW).
6.  **Generate:** Generate device keys (Ed25519 + ECDH P-256).
7.  **Create Slot:** Create own ECDH device key slot (wrapping VaultKey).
8.  **Register:** Add self to device registry in vault data.
9.  **Derive:** Derive MasterKEK from password → wrap device private keys.
10. **Sign:** Sign updated envelope (Ed25519).
11. **Upload:** Upload updated vault to S3.
12. **Persist:** Store wrapped keys + device state in IndexedDB.
13. **Wipe:** `secureWipe(secretKey, passwordBuffer)`.

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
- [ ] **Pepper (NEW):** The Password KDF input includes a global, high-entropy ApplicationPepper secret mixed with the user's password.
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

### Platform Security

- [ ] **Strict CSP:** manifest.json contains `"content_security_policy": { "extension_pages": "script-src 'self'; object-src 'none';" }`.
- [ ] **No Remote Code:** No usage of `eval()`, `new Function()`, or remotely hosted script files.

---
