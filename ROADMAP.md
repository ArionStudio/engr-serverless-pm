# ROADMAP

> Implementation sequence for the serverless password manager.
> Last updated: 2026-02-18
> This is the only planning file.

## Overview

This roadmap follows hexagonal architecture:

```text
Core (types/ports) -> Adapters (implementations) -> UI/Extension (consumption)
```

Each phase builds on previous phases. Do not skip dependencies.

## Scope Markers

| Marker         | Meaning                                    |
| -------------- | ------------------------------------------ |
| `[Thesis]`     | Required for engineering thesis completion |
| `[Production]` | Required for production readiness          |
| `[Future]`     | Explicitly deferred                        |

## Current State (Repo-Verified)

### Completed

- [x] Architecture diagrams in `docs/architecture/**`
- [x] Core domain types and ports in `apps/extension/src/core/**`
- [x] Crypto adapter in `apps/extension/src/adapters/crypto/web-crypto-api.adapter.ts`
- [x] Device key adapter in `apps/extension/src/adapters/device/web-crypto-device-key.adapter.ts` (partial — missing KDF on ECDH)
- [x] Storage adapter in `apps/extension/src/adapters/storage/dexie-storage.adapter.ts`
- [x] Dexie DB schema/migrations in `apps/extension/src/infrastructure/database/dexie-db.ts`
- [x] Extension tests currently pass (`pnpm ext:test`)
- [x] S3+Cognito CloudFormation template and docs

### Not Started / Partial

- [ ] ConcatKDF/HKDF + SlotKEK derivation (Phase 2b gap — §3.6, §5.2)
- [ ] Master password runtime flow (genesis/unlock/lock/auto-lock)
- [ ] Password CRUD wired to encrypted vault lifecycle
- [ ] Signed snapshot pipeline end-to-end
- [ ] Sync adapter implementation (`SyncPort`)
- [ ] Conflict resolution flow/UI
- [ ] Browser autofill/save integration

---

## Phase 0: Architecture Documentation `[Thesis]`

### Goal

Visual architecture and trust model before implementation.

### Checklist

- [x] Overview diagrams (`docs/architecture/*.puml`)
- [x] Data-flow diagrams (`docs/architecture/flow/*`)
- [x] Sequence diagrams (`docs/architecture/sequence/*`)
- [x] State-machine diagrams (`docs/architecture/state-machine/*`)

### Output

- [x] Architecture documentation set exists in repo

---

## Phase 1: Core Types & Ports `[Thesis]`

### Goal

Define pure domain contracts, no runtime dependencies.

### Checklist

- [x] Crypto domain contracts (`apps/extension/src/core/crypto/**`)
- [x] Vault contracts (`apps/extension/src/core/vault/**`)
- [x] Device contracts (`apps/extension/src/core/device/**`)
- [x] Storage contracts (`apps/extension/src/core/storage/**`)
- [x] Sync contracts (`apps/extension/src/core/sync/**`)
- [x] Password/session/organization contracts
- [x] Core constants + utils

### Validation

- [x] Types compile under strict TS setup

---

## Phase 2: Crypto & Device Adapters `[Thesis]`

### Goal

Implement profile-driven crypto with WebCrypto.

### 2a Crypto Adapter

Location: `apps/extension/src/adapters/crypto/web-crypto-api.adapter.ts`

- [x] PBKDF2-SHA256 (600k iterations)
- [x] Pepper pre-processing path
- [x] AES-256-GCM encrypt/decrypt
- [x] Random salt + IV generation
- [x] Hashing via profile-selected suite
- [x] Key wrap/unwrap via profile-selected suite

### 2b Device Key Adapter

Location: `apps/extension/src/adapters/device/web-crypto-device-key.adapter.ts`

- [x] Generate Ed25519 signing keys
- [x] Generate ECDH P-256 agreement keys
- [x] Export public keys as JWK
- [x] Wrap/unwrap private keys with MasterKEK
- [x] Sign/verify via profile-selected suite
- [x] Shared-secret derivation
- [x] Malformed wrapped-key validation before unwrap
- [ ] ConcatKDF (NIST SP 800-56A) or HKDF implementation for ECDH shared secrets
- [ ] `deriveSlotKEK()` — ECDH + KDF pipeline returning a safe AES wrapping key
- [ ] Enforce KDF on raw ECDH output (§3.6: raw `deriveBits` must never be used directly)

### Validation

- [x] Adapter test suites pass
- [ ] ConcatKDF/HKDF test vectors
- [ ] SlotKEK derivation round-trip tests

---

## Phase 3: Local Storage Adapter `[Thesis]`

### Goal

Implement local persistence with deterministic singleton access.

### Checklist

- [x] Dexie schema (`vault`, `deviceState`, `pendingSync`)
- [x] Vault save/load/clear
- [x] Device state save/load/clear
- [x] Pending sync queue operations
- [x] DB health check and full wipe
- [x] Deterministic singleton reads/writes (canonical keys)
- [x] Persist vault `profileId` in local vault record

### Location

- `apps/extension/src/adapters/storage/dexie-storage.adapter.ts`
- `apps/extension/src/infrastructure/database/dexie-db.ts`

### Validation

- [x] Storage and migration tests pass

---

## Phase 4: Master Password Flow `[Thesis]`

### Goal

Complete vault session lifecycle (genesis, unlock, lock, auto-lock).

### Checklist

- [ ] Genesis setup flow
- [ ] Derive MasterKEK from password + salt
- [ ] Generate VaultKey + device keys + initial snapshot
- [ ] Secret-key generation + one-time display flow
- [ ] Unlock flow and in-memory session hydration
- [ ] Lock flow with memory cleanup
- [ ] Auto-lock timer and timeout configuration

### Validation

- [ ] Correct password unlocks
- [ ] Wrong password fails cleanly
- [ ] Lock removes runtime-sensitive state
- [ ] Auto-lock triggers and relock works

---

## Phase 5: Password CRUD `[Thesis]`

### Goal

Functional offline password manager over encrypted vault data.

### Checklist

- [ ] Create password entries
- [ ] List/read entries
- [ ] Edit/update entries
- [ ] Delete entries
- [ ] Search by title/url/username
- [ ] Folder organization
- [ ] Password generator integration
- [ ] Clipboard copy with timed clear

### Validation

- [ ] Full CRUD cycle works offline
- [ ] Search/filter tests
- [ ] Folder behavior tests

---

## Phase 6: Signed Snapshot Pipeline `[Thesis]`

### Goal

Implement signed vault snapshot pipeline aligned with core vault types.

### Core Types Already Present

- `apps/extension/src/core/vault/vault-snapshot.type.ts`
- `apps/extension/src/core/vault/vault-envelope.type.ts`
- `apps/extension/src/core/vault/vault-metadata.type.ts`
- `apps/extension/src/core/vault/encrypted-payload.type.ts`

### Checklist

- [ ] Snapshot serialization/deserialization
- [ ] Canonicalized envelope signing input (JCS)
- [ ] Signature create/verify flow
- [ ] AAD binding strategy implemented in runtime pipeline
- [ ] Version migration guardrails

### Validation

- [ ] Signature/tamper tests
- [ ] Snapshot round-trip tests
- [ ] AAD mismatch rejection tests

---

## Phase 7: Cloud Sync Adapter `[Thesis]`

### Goal

Implement sync adapter conforming to `SyncPort`.

### Target Location

- `apps/extension/src/adapters/sync/` (to be created)

### Checklist

- [ ] AWS credential bootstrap (Cognito identity flow)
- [ ] `upload/download/delete/list` implementation
- [ ] Per-user object key convention
- [ ] Last-sync metadata handling
- [ ] Retry/backoff and failure handling

### Validation

- [ ] Adapter unit tests with mocked AWS boundaries
- [ ] End-to-end sync smoke scenario

---

## Phase 8: Conflict Resolution `[Thesis]`

### Goal

Deterministic local-vs-remote conflict handling with explicit user choices.

### Checklist

- [ ] Diff engine (local/remote)
- [ ] Conflict classification
- [ ] Resolution actions (use local/use remote/skip)
- [ ] Conflict review UI
- [ ] Merge + persist + upload pipeline

### Validation

- [ ] Conflict simulation tests
- [ ] Resolution correctness tests

---

## Phase 9: Browser Integration `[Thesis]`

### Goal

Extension browser workflows (autofill/save/generate).

### Checklist

- [ ] Form detection logic
- [ ] Credential matching and fill actions
- [ ] Save-password detection flow
- [ ] Context menu actions

### Validation

- [ ] Unit tests for detection/matching
- [ ] Integration tests on representative forms

---

## Phase 10: Device Management `[Production]`

### Goal

Multi-device lifecycle and revocation controls.

### Checklist

- [ ] Secret-key self-enrollment
- [ ] Device registry UI
- [ ] New device detection on sync
- [ ] Device revocation flow
- [ ] Key rotation flow

---

## Phase 11: Polish `[Future]`

### Checklist

- [ ] Import/export (CSV, Bitwarden, etc.)
- [ ] Breach checking (k-anonymity)
- [ ] Accessibility hardening
- [ ] Cross-browser/mobile strategy

---

## Cross-Cutting Workstreams

### Documentation

- [ ] Root `README.md` full onboarding
  - [ ] Project overview
  - [ ] Setup instructions
  - [ ] Build/lint/test commands
  - [ ] Load unpacked extension guide
  - [ ] Documentation map
- [ ] Adapter architecture guide
- [ ] End-user security summary

### Testing

- [x] Crypto tests
- [x] Device key tests
- [x] Storage tests
- [x] DB migration tests
- [ ] Master password/session lifecycle tests
- [ ] Sync logic tests
- [ ] Conflict flow tests
- [ ] Browser integration tests
- [ ] E2E critical path tests `[Future]`

### Infrastructure

- [x] AWS S3+Cognito template/docs
- [ ] Validate deployment in real AWS account
- [ ] CI for extension checks `[Future]`

---

## Dependency Graph

```text
0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9
                                 \-> 10 (production hardening)
```

Critical path for thesis: `0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9`

---

## Success Criteria

### Thesis Completion

- [ ] All `[Thesis]` phases complete
- [ ] Security-spec behavior implemented in runtime code
- [ ] Offline-first extension flow works end-to-end
- [ ] Stable passing test baseline for core/adapters

### Production Readiness

- [ ] Device revocation + rotation fully functional
- [ ] Security review completed
- [ ] Cloud setup/recovery runbook complete

---

## Maintenance Rules

- Update this file in the same PR as feature status changes.
- Do not maintain parallel roadmap/todo files.
