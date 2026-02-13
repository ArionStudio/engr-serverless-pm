# ROADMAP.md

> Implementation sequence for the serverless password manager.
> Last updated: 2026-02-13

## Overview

This roadmap follows **hexagonal architecture** principles:

```
Core (types/ports) → Adapters (implementations) → UI (consumption)
```

Each phase builds on the previous. Skipping phases creates technical debt.

### Scope Markers

| Marker         | Meaning                                    |
| -------------- | ------------------------------------------ |
| `[Thesis]`     | Required for engineering thesis completion |
| `[Production]` | Required for real-world deployment         |
| `[Future]`     | Nice-to-have, post-thesis improvements     |

---

## Testing Strategy

Tests are written **within each phase**, not as a separate phase.

### Tools

| Tool       | Purpose                  | Location                        |
| ---------- | ------------------------ | ------------------------------- |
| Vitest     | Unit & integration tests | `**/*.test.ts`, `**/*.test.tsx` |
| Storybook  | Component visual testing | `**/*.stories.tsx`              |
| Playwright | E2E browser tests        | Separate task (post-thesis)     |

### Coverage Targets

- Core + Adapters: >80%
- UI Components: >60%

---

## Validation of Original Proposal

The originally proposed sequence (Envelope → Sync → Conflict → UI → Safe Save) represents **Phase 6-8 work**. Here's why each step requires earlier phases:

| Proposed Step          | Actual Phase | Why It Needs Earlier Phases                          |
| ---------------------- | ------------ | ---------------------------------------------------- |
| Signed Envelope Format | Phase 6      | Needs crypto adapter (Phase 2) to sign envelopes     |
| S3 Sync Adapter        | Phase 7      | Needs storage adapter (Phase 3) to have data to sync |
| Conflict Resolution    | Phase 8      | Needs CRUD (Phase 5) to have conflicting items       |
| UI Polish              | Phase 8+     | Needs working features to polish                     |
| Safe Save Flow         | Phase 5      | Needs master password flow (Phase 4) first           |

**The proposal is correct in spirit but inverted in sequence.** You cannot sync passwords that don't exist yet.

---

## Phase 0: Architecture Documentation `[Thesis]`

**Goal:** Visual diagrams before code.

### Architecture Overviews (`docs/architecture/*.puml`)

- [x] `00-architecture-overview.puml` - High-level system architecture
- [x] `01-key-hierarchy.puml` - Cryptographic key relationships
- [x] `02-trust-boundaries.puml` - Security trust boundaries

### Data Flow Diagrams (`docs/architecture/flow/`)

- [x] `01-key-derivation-master-kek.flow.puml` - Key derivation flow
- [x] `02-vault-encrypt-decrypt.flow.puml` - Encryption/decryption paths
- [x] `03-genesis-first-time-setup.flow.puml` - First-time setup flow
- [x] `04-vault-unlock-lock.flow.puml` - Lock/unlock flow
- [x] `05-offline-queue-processing.flow.puml` - Offline queue flow
- [x] `06-sync-conflict-resolution.flow.puml` - Conflict resolution flow

### Sequence Diagrams (`docs/architecture/sequence/`)

- [x] `01-password-crud-operations.sequence.puml` - CRUD operations
- [x] `02-cloud-sync-upload-download.sequence.puml` - Cloud sync
- [x] `03-multi-device-registration.sequence.puml` - Device registration
- [x] `04-device-revocation-key-rotation.sequence.puml` - Revocation flow
- [x] `05-browser-autofill.sequence.puml` - Autofill flow
- [x] `06-browser-save-password.sequence.puml` - Save password flow

### State Machine Diagrams (`docs/architecture/state-machine/`)

- [x] `01-offline-queue.state-machine.puml` - Offline queue states
- [x] `02-vault-lock-unlock.state-machine.puml` - Lock/unlock states
- [x] `03-device-lifecycle.state-machine.puml` - Device lifecycle states

**Output:** `docs/architecture/` with PlantUML diagrams (render to SVG/PNG)

---

## Phase 1: Core Types & Ports `[Thesis]`

**Goal:** Define all domain types and port interfaces. Pure TypeScript, zero dependencies.

### Types (`src/core/[domain]/*.type.ts`)

**Passwords & Organization:**

- [x] `password.type.ts` - PasswordEntry, PasswordMetadata, custom fields
- [x] `folder.type.ts` - Folder hierarchy
- [x] `tag.type.ts` - Tag system
- [x] `templates.type.ts` - Password entry templates
- [x] `global-library.type.ts` - Shared library types

**Crypto** (`src/core/crypto/`):

- [x] `crypto.port.ts` - CryptoPort interface (deriveKey, encrypt, decrypt, hash, wrapKey, unwrapKey)
- [x] `crypto.const.ts` - Crypto constants
- [x] `algorithms/` - KDF, symmetric, signing, key-exchange, key-wrap, hashing configs
- [x] `suites/` - Algorithm suite definitions, registry, helpers
- [x] `profiles/` - Crypto profile registry and types
- [x] `formats/` - Key format and serialization suite types
- [x] `keys/` - CryptoKey aggregate types

**Vault:**

- [x] `vault.type.ts` - Vault structure
- [x] `key-slot.type.ts` - Device key slots
- [x] `encrypted-payload.type.ts` - Encrypted payload (IV, ciphertext, AAD)
- [x] `vault-envelope.type.ts` - Signed vault envelope
- [x] `vault-metadata.type.ts` - Vault metadata (devices, timestamps)
- [x] `vault-snapshot.type.ts` - Vault snapshot for sync

**Device:**

- [x] `device.type.ts` - DeviceIdentity, DeviceRegistryEntry, DeviceDisplayInfo
- [x] `device-key.type.ts` - Device key pairs
- [x] `device-environment.type.ts` - Environment info for user recognition

**Storage & Sync:**

- [x] `storage.type.ts` - IndexedDB schema types
- [x] `sync.type.ts` - SyncState, SyncStatus
- [x] `sync-diff.type.ts` - Diff types for conflict resolution
- [x] `provider-config.type.ts` - Cloud provider configuration

**Session:**

- [x] `session.type.ts` - Session state types

### Ports (`src/core/[domain]/*.port.ts`)

- [x] `crypto.port.ts` - CryptoPort interface
- [x] `storage.port.ts` - StoragePort interface
- [x] `sync.port.ts` - SyncPort interface
- [x] `device-key.port.ts` - DeviceKeyPort interface
- [x] `device-environment.port.ts` - DeviceEnvironmentPort interface

### Constants & Utils

- [x] `algorithm-suite.const.ts` - Algorithm suite constants (in `crypto/suites/`)
- [x] `storage.const.ts` - Storage constants
- [x] `sync.const.ts` - Sync constants
- [x] `session.const.ts` - Session constants
- [x] `folder.const.ts` - Default folders
- [x] `tag.const.ts` - Tag constants
- [x] `templates.const.ts` - Default templates
- [x] `device-environment.const.ts` - Device detection constants
- [x] `password.util.ts` - Password utilities
- [x] `key-slot.util.ts` - Key slot utilities
- [x] `session.util.ts` - Session utilities
- [x] `provider-config.util.ts` - Provider config utilities
- [x] `device-environment.util.ts` - Environment form utilities

**Validation:** All types compile with `strict: true`, no runtime dependencies.

### Tests

- [x] Type compilation tests (strict mode validation)

---

## Phase 2: Crypto & Device Key Adapters (WebCrypto) `[Thesis]`

**Goal:** Implement CryptoPort and DeviceKeyPort using WebCrypto API.

### 2a: Crypto Adapter (CryptoPort) ✓

Key derivation, symmetric encryption, hashing, and key wrapping.

- [x] PBKDF2-SHA256 with 600,000 iterations
- [x] Application pepper (hardcoded, defense-in-depth)
- [x] Salt generation and storage
- [x] AES-256-GCM encryption
- [x] Random IV per operation (96-bit)
- [x] AAD binding for context
- [x] Key wrapping / unwrapping (AES-256-GCM via profile suite)
- [x] Vault key generation
- [x] Hashing (SHA-256 via profile suite)

**Location:** `src/adapters/crypto/web-crypto-api.adapter.ts`

#### Tests

- [x] Key derivation round-trip (derive → wrap → unwrap)
- [x] Different salts produce different derived keys
- [x] Salt generation (32 bytes default, custom length)
- [x] IV generation (12 bytes)
- [x] Vault key generation (AES-256-GCM, 256-bit)
- [x] Encrypt/decrypt round-trip
- [x] IV uniqueness per encryption
- [x] AAD binding (correct, wrong, missing AAD)
- [x] SHA-256 known test vectors (empty input, "abc")
- [x] Key wrap/unwrap round-trip
- [x] Wrapped output size (12 IV + 32 key + 16 tag = 60 bytes)
- [x] Wrapping randomness (random IV per wrap)
- [x] Application pepper (32-byte constant, preprocessPassword)
- [x] PBKDF2 test vectors (RFC 7914 Appendix B)
- [x] AES-256-GCM test vectors (NIST SP 800-38D)

### 2b: Device Key Adapter (DeviceKeyPort) ✓

Device identity key pairs, signing, key agreement, and private key protection.

- [x] Generate device keys (Ed25519 signing + ECDH P-256 agreement)
- [x] Export public keys as JWK
- [x] Wrap/unwrap device private keys with MasterKEK (AES-256-GCM A256GCMKW)
- [x] Sign and verify (Ed25519)
- [x] Derive shared secret (ECDH P-256)

**Location:** `src/adapters/device/web-crypto-device-key.adapter.ts`

#### Tests

- [x] Ed25519 signature verification tests
- [x] ECDH key exchange tests
- [x] ECDH P-256 PKCS8 wrap/unwrap round-trip
- [x] Per-key IV uniqueness (signing IV ≠ agreement IV)

### Memory Hygiene (shared) ✓

- [x] `secureWipe()` utility for sensitive data
- [x] Vault Key held in memory only (never persisted)

#### Tests

- [x] `secureWipe()` memory clearing tests

**Validation:** Unit tests with known test vectors.

---

## Phase 3: Storage Adapter (IndexedDB) `[Thesis]`

**Goal:** Implement storage port using Dexie.js.

### Database Schema

- [ ] `vaults` table - encrypted vault blobs
- [ ] `metadata` table - unencrypted metadata (lastSync, deviceId)
- [ ] `pendingSync` table - offline queue

### Operations

- [ ] `saveVault(encrypted: EncryptedBlob)`
- [ ] `loadVault(): EncryptedBlob | null`
- [ ] `clearVault()` - secure deletion

**Location:** `src/adapters/storage/`

**Validation:** Integration tests with in-memory IndexedDB.

### Tests

- [ ] CRUD operations with fake-indexeddb
- [ ] Schema migration tests
- [ ] Encrypted blob storage/retrieval

---

## Phase 4: Master Password Flow `[Thesis]`

**Goal:** Complete lock/unlock lifecycle.

### Flows

- [ ] **Genesis** - First-time setup, derive Vault Key, create empty vault
- [ ] **Unlock** - Derive Vault Key, decrypt vault, load into memory
- [ ] **Lock** - Wipe Vault Key from memory, clear UI state
- [ ] **Auto-lock** - Timer-based lock (configurable)

### UI Components

- [ ] Master password input (with strength indicator)
- [ ] Unlock screen
- [ ] Lock confirmation

**Validation:** Can create vault, lock, unlock, and data persists.

### Tests

- [ ] Genesis flow (first-time setup)
- [ ] Unlock with correct/incorrect password
- [ ] Lock clears memory state
- [ ] Auto-lock timer triggers correctly

---

## Phase 5: Password CRUD `[Thesis]`

**Goal:** Core password management functionality.

### Operations

- [ ] **Create** - Add new password entry
- [ ] **Read** - List and search passwords
- [ ] **Update** - Edit existing entry
- [ ] **Delete** - Remove entry (soft delete for sync)

### Features

- [ ] Folder organization
- [ ] Search (title, URL, username)
- [ ] Password generator integration
- [ ] Copy to clipboard (auto-clear after 30s)

### UI Components

- [ ] Password list view
- [ ] Password detail/edit form
- [ ] Folder sidebar
- [ ] Search bar

**Validation:** Full CRUD cycle works offline.

### Tests

- [ ] Create/Read/Update/Delete operations
- [ ] Folder organization
- [ ] Search functionality
- [ ] Clipboard auto-clear timing

### Storybook

- [ ] Password list view stories
- [ ] Password form stories
- [ ] Empty states

---

## Phase 6: Signed Envelope Format `[Thesis]`

**Goal:** Tamper-evident sync format.

### Envelope Structure

```typescript
interface SignedEnvelope {
  payload: EncryptedBlob; // AES-256-GCM encrypted vault
  signature: Uint8Array; // Ed25519 signature
  deviceId: string; // Signing device
  timestamp: number; // Unix ms
  version: number; // Schema version
}
```

### Implementation

- [ ] Envelope creation with JCS (JSON Canonicalization)
- [ ] AAD binding (deviceId + timestamp in AAD)
- [ ] Signature verification
- [ ] Version migration support

**Location:** `src/core/types/envelope.types.ts`, `src/adapters/crypto/envelope.ts`

**Validation:** Round-trip serialization tests.

### Tests

- [ ] Envelope serialization round-trip
- [ ] Signature creation/verification
- [ ] AAD binding validation
- [ ] Version migration handling

---

## Phase 7: S3 Sync Adapter `[Thesis]`

**Goal:** Cloud sync via AWS S3 + Cognito.

### AWS Integration

- [ ] Cognito authentication (anonymous or email)
- [ ] S3 bucket access via presigned URLs
- [ ] Per-user object key: `vaults/{cognitoId}/vault.enc`

### Sync Operations

- [ ] `upload(envelope: SignedEnvelope)`
- [ ] `download(): SignedEnvelope | null`
- [ ] `getLastModified(): Date`

### Offline Support

- [ ] Queue changes when offline
- [ ] Retry with exponential backoff
- [ ] Conflict detection (ETag mismatch)

**Location:** `src/adapters/sync/`

**Validation:** Integration tests with LocalStack or real AWS.

### Tests

- [ ] Upload/download with mocked S3 (msw or LocalStack)
- [ ] Cognito token refresh
- [ ] Offline queue persistence
- [ ] Retry with exponential backoff

---

## Phase 8: Conflict Resolution UI `[Thesis]`

**Goal:** Handle sync conflicts gracefully.

### Conflict Detection

- [ ] Compare local vs remote timestamps
- [ ] Detect concurrent edits

### Resolution Strategies

- [ ] **Keep Local** - Overwrite remote
- [ ] **Keep Remote** - Overwrite local
- [ ] **Merge** - Field-level merge (if possible)
- [ ] **Manual** - Show diff, let user decide

### UI Components

- [ ] Conflict notification
- [ ] Side-by-side diff view
- [ ] Resolution action buttons

**Validation:** Simulate concurrent edits, resolve correctly.

### Tests

- [ ] Conflict detection (timestamp comparison)
- [ ] Keep local/remote resolution
- [ ] Merge conflict scenarios

### Storybook

- [ ] Conflict notification component
- [ ] Side-by-side diff view
- [ ] Resolution buttons

---

## Phase 9: Browser Integration `[Thesis]`

**Goal:** Chrome extension features.

### Autofill

- [ ] Content script for form detection
- [ ] Match URLs to saved passwords
- [ ] Inject credentials on user action

### Context Menu

- [ ] Right-click "Save password"
- [ ] Right-click "Generate password"

### Omnibox

- [ ] Quick search via address bar

**Validation:** Works on major sites (Google, GitHub, etc.)

### Tests

- [ ] Form detection logic (unit)
- [ ] URL matching algorithm
- [ ] Context menu actions

Note: Full E2E with Playwright is a separate task.

---

## Phase 10: Device Management `[Production]`

**Goal:** Multi-device support with revocation.

### Features

- [ ] Device registration flow
- [ ] Device list UI
- [ ] Remote device revocation
- [ ] Key rotation on revocation

### Security

- [ ] Re-wrap Vault Key for each device
- [ ] Revoked devices can't decrypt new vaults

**Validation:** Add device, revoke device, verify access control.

---

## Phase 11: Polish `[Future]`

**Goal:** Quality-of-life improvements.

### Import/Export

- [ ] Import from Chrome, Firefox, 1Password, Bitwarden
- [ ] Export to CSV (encrypted option)

### Security Enhancements

- [ ] HIBP breach checking (k-anonymity)
- [ ] Password strength scoring
- [ ] Duplicate password detection

### UX Improvements

- [ ] Keyboard shortcuts
- [ ] Dark/light theme (done)
- [ ] Accessibility audit

---

## Dependency Graph

```
Phase 0 (Docs)
    │
    v
Phase 1 (Core Types) ─────────────────────────────┐
    │                                              │
    v                                              │
Phase 2 (Crypto) ──────────────────┐               │
    │                               │               │
    v                               v               v
Phase 3 (Storage) ────────> Phase 6 (Envelope) ────┤
    │                               │               │
    v                               v               │
Phase 4 (Master PW) ──────> Phase 7 (S3 Sync) ─────┤
    │                               │               │
    v                               v               │
Phase 5 (CRUD) ───────────> Phase 8 (Conflicts) ───┤
    │                               │               │
    v                               v               v
Phase 9 (Browser) ────────> Phase 10 (Devices) ───> Phase 11 (Polish)
```

**Critical Path:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

---

## Success Metrics

### Thesis Completion (Phases 0-9)

- [ ] All `[Thesis]` checkboxes complete
- [ ] Security specification implemented as documented
- [ ] Working Chrome extension with offline-first sync
- [ ] Test coverage > 80% for core and adapters
- [ ] Documentation complete for thesis defense

### Production Ready (Phase 10)

- [ ] Device management with secure revocation
- [ ] Security audit passed
- [ ] Performance benchmarks met

### Future (Phase 11)

- [ ] Import from major password managers
- [ ] Breach checking integration
- [ ] Accessibility WCAG 2.1 AA compliant

---

## Current Status

| Phase | Status      | Notes                                                                                     |
| ----- | ----------- | ----------------------------------------------------------------------------------------- |
| 0     | Complete    | All diagrams done (PlantUML)                                                              |
| 1     | Complete    | All types, ports, constants & utils defined; type compilation tests ✓                     |
| 2     | Complete    | CryptoPort ✓, DeviceKeyPort ✓, secureWipe ✓, pepper ✓, memory guard ✓, standard vectors ✓ |
| 3     | Not Started | Depends on Phase 2                                                                        |
| 4     | Not Started | Depends on Phase 2-3                                                                      |
| 5     | Not Started | Depends on Phase 4                                                                        |
| 6     | Not Started | Depends on Phase 2                                                                        |
| 7     | Not Started | Depends on Phase 3, 6                                                                     |
| 8     | Not Started | Depends on Phase 5, 7                                                                     |
| 9     | Not Started | Depends on Phase 5                                                                        |
| 10    | Not Started | Post-thesis                                                                               |
| 11    | Not Started | Future                                                                                    |

**UI Layer:** Working (theme system, Button component, popup with mock data)
