# ROADMAP.md

> Implementation sequence for the serverless password manager.
> Last updated: 2026-01-26

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

- [ ] Data flow diagrams (encryption/decryption paths)
- [ ] Component interaction diagrams
- [ ] State machine diagrams (lock/unlock states)
- [ ] Sequence diagrams for critical flows

**Output:** `docs/architecture/` with SVG/PNG diagrams

---

## Phase 1: Core Types & Ports `[Thesis]`

**Goal:** Define all domain types and port interfaces. Pure TypeScript, zero dependencies.

### Types (`src/core/types/`)

- [ ] `password.types.ts` - Password, PasswordMetadata, Folder
- [ ] `crypto.types.ts` - VaultKey, DeviceKey, EncryptedBlob, Envelope
- [ ] `sync.types.ts` - SyncState, ConflictRecord, DeviceInfo
- [ ] `storage.types.ts` - VaultSchema, IndexedDBSchema

### Ports (`src/core/ports/`)

- [ ] `crypto.port.ts` - ICryptoService interface
- [ ] `storage.port.ts` - IStorageService interface
- [ ] `sync.port.ts` - ISyncService interface

**Validation:** All types compile with `strict: true`, no runtime dependencies.

---

## Phase 2: Crypto Adapter (WebCrypto) `[Thesis]`

**Goal:** Implement crypto port using WebCrypto API.

### Key Derivation

- [ ] PBKDF2-SHA256 with 600,000 iterations
- [ ] Application pepper (hardcoded, defense-in-depth)
- [ ] Salt generation and storage

### Symmetric Encryption

- [ ] AES-256-GCM encryption
- [ ] Random IV per operation (96-bit)
- [ ] AAD binding for context

### Asymmetric Operations

- [ ] Ed25519 for device signing
- [ ] ECDH P-256 for key exchange
- [ ] Device key slot wrapping

### Memory Hygiene

- [ ] `secureWipe()` utility for sensitive data
- [ ] Vault Key held in memory only (never persisted)

**Location:** `src/adapters/crypto/`

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

| Phase | Status      | Notes                            |
| ----- | ----------- | -------------------------------- |
| 0     | Not Started | Diagrams needed                  |
| 1     | Not Started | Core layer empty (.gitkeep only) |
| 2     | Not Started | Adapters layer empty             |
| 3     | Not Started | Adapters layer empty             |
| 4     | Not Started | Depends on Phase 2-3             |
| 5     | Not Started | Depends on Phase 4               |
| 6     | Not Started | Depends on Phase 2               |
| 7     | Not Started | Depends on Phase 3, 6            |
| 8     | Not Started | Depends on Phase 5, 7            |
| 9     | Not Started | Depends on Phase 5               |
| 10    | Not Started | Post-thesis                      |
| 11    | Not Started | Future                           |

**UI Layer:** Working (theme system, Button component, popup with mock data)
