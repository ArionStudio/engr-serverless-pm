# TODO

## Status Legend

- [ ] Not started
- [x] Completed
- [~] Partial/Placeholder only
- **[Future]** - Out of engineering work scope (documented for completeness)

---

## Engineering Work Scope

> **Focus**: Evaluating WebCrypto API capabilities and proving it is sufficient
> for building a fully functional and secure serverless password manager.

### In Scope (Core Engineering Work)

| Area             | What's Included                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| **Crypto**       | WebCrypto adapter (PBKDF2, AES-256-GCM, Ed25519 signing, ECDH P-256 exchange), security testing |
| **Storage**      | IndexedDB adapter with Dexie.js, encrypted local storage                                        |
| **Sync**         | S3 adapter, manual sync, conflict resolution                                                    |
| **Security**     | Master password flow, key derivation, encryption, device key auth, threat model                 |
| **Browser**      | Autofill, form detection, context menu                                                          |
| **Organization** | Folder system (basic hierarchy)                                                                 |
| **Testing**      | Security-focused tests (encryption safety, access points, device keys)                          |

### Out of Scope (Future Work)

Items marked with **[Future]** are important for a production-ready product but not
required to prove WebCrypto's sufficiency for the engineering thesis. These include:

- Additional cloud providers (GCS, Azure)
- Platform portability (multi-browser, mobile)
- Polish features (breach checking, import/export)
- Advanced sync (auto-sync, offline queue, history)
- Full organization system (tags, templates, Global Library)
- UI design research and full design system

---

## Architecture Constraints

> **Serverless Model**: No custom backend server. All logic runs in the browser extension.
> Cloud services (S3, GCS, Azure, Cognito) are used only for data storage and credential provisioning.

| What we CAN do                    | What we CANNOT do                 |
| --------------------------------- | --------------------------------- |
| Client-side encryption/decryption | Server-side validation            |
| Store metadata in cloud vault     | Real-time push notifications      |
| Client-enforced access control    | Server-enforced access revocation |
| Timestamp validation in payloads  | True one-time tokens              |
| Audit trail in vault metadata     | Central session management        |

---

## Documentation

- [ ] Make instruction how to add extension build to Chrome
- [ ] README.md with:
  - [ ] Project overview and goals (serverless password manager)
  - [ ] Architecture summary (hexagonal, adapters pattern)
  - [ ] Quick start guide (setup, build, load extension)
  - [ ] Link to detailed docs
- [ ] Adapter architecture documentation:
  - [ ] Port interfaces and their contracts
  - [ ] How to implement a new storage provider
  - [ ] How to implement a new auth provider
  - [ ] Examples with existing adapters
- [ ] Review: Check if we need security model documentation for end users
- [x] AWS S3+Cognito setup documentation (docs/aws/s3-cognito/README.md)
- [x] Architecture comparison document (docs/architecture/architecture-comparison.md)
- [x] Conventions and patterns guide (docs/development/conventions.md)
- [x] Password organization design (docs/design/password-organization.md)
- [x] Sync strategy design (docs/design/sync-strategy.md)
- [x] Multi-device setup design (docs/design/multi-device-setup.md)

---

## Architecture (Hexagonal)

### Core Layer (`src/core/`)

- [x] Crypto port and types
  - [x] `crypto.port.ts` - deriveKey, encrypt, decrypt, hash, wrapKey, unwrapKey interfaces
  - [x] `encrypted-payload.type.ts` - IV, ciphertext, AAD types
  - [x] `crypto/algorithms/` - KDF, symmetric, signing, key-exchange, key-wrap, hashing configs
  - [x] `crypto/suites/` - Algorithm suite definitions (configurable crypto primitives)
  - [x] `crypto/profiles/` - Crypto profile registry and types
  - [x] `crypto/formats/` - Key format and serialization suite types
  - [x] `crypto/keys/` - CryptoKey aggregate types
- [x] Vault types
  - [x] `vault.type.ts` - Vault structure
  - [x] `vault-envelope.type.ts` - Signed vault envelope
  - [x] `vault-metadata.type.ts` - Vault metadata (devices, timestamps)
  - [x] `vault-snapshot.type.ts` - Vault snapshot for sync
  - [x] `key-slot.type.ts` - Device key slots
- [x] Password types
  - [x] `password.type.ts` - Password, EncryptedPassword
  - [x] `folder.type.ts` - Folder with icon support
  - [x] **[Future]** `tag.type.ts` - Tag with color and groupId
  - [ ] **[Future]** `tag-group.type.ts` - TagGroup with baseColor
- [ ] Password repository port
  - [ ] `password-repository.port.ts` - CRUD interface
- [x] Sync port and types
  - [x] `sync.port.ts` - upload, download, delete, list
  - [x] `sync-diff.type.ts` - SyncChange, SyncConflict, SyncDiff
- [x] Device key types
  - [x] `device.type.ts` - Device, DeviceRegistry
  - [x] `device-key.type.ts` - Device key pair types
  - [x] `device-key.port.ts` - generateSignKeyPair (Ed25519), generateExchangeKeyPair (ECDH P-256), sign, verify interfaces
- [x] Storage port and types
  - [x] `storage.port.ts` - StoragePort interface
  - [x] `storage.type.ts` - IndexedDB schema types
- [x] Session types
  - [x] `session.type.ts` - Session state types
- [x] **[Future]** Global library types
  - [x] `global-library.type.ts` - folder/tag definitions
  - [x] `templates.type.ts` - organization archetypes

### Adapters Layer (`src/adapters/`)

- [x] Crypto adapter
  - [x] `web-crypto-api.adapter.ts` - PBKDF2 + AES-256-GCM + key wrapping (generateSalt, generateIV, generateVaultKey, deriveKey, encrypt, decrypt, hash, wrapKey, unwrapKey)
- [x] Device key adapter
  - [x] `web-crypto-device-key.adapter.ts` - Ed25519 signing + ECDH P-256 agreement, wrap/unwrap (AES-256-GCM), sign/verify, deriveSharedSecret
- [ ] Storage adapter
  - [ ] `indexeddb.adapter.ts` - local encrypted storage (using Dexie.js)
- [ ] Sync adapters (implement SyncPort interface)
  - [ ] `s3.adapter.ts` - AWS S3 provider
  - [ ] **[Future]** `gcs.adapter.ts` - Google Cloud Storage provider
  - [ ] **[Future]** `azure.adapter.ts` - Azure Blob Storage provider
- [ ] Auth adapter
  - [ ] AWS Cognito integration (for obtaining temporary S3 credentials only)
  - [ ] Credential refresh handling
  - Note: Cognito is infrastructure for cloud access, not app authentication

---

## UI / Components

- [ ] Switch from Radix UI to Base UI (MUI's headless library)
  - shadcn/ui now supports Base UI (Dec 2025)
  - See: https://ui.shadcn.com/create and https://basecn.dev/
- [ ] Primitive components (only Button implemented)
- [ ] Implement proper theming/dark mode support

### Design Research

- [ ] **[Future]** Use Mobbin for UI/UX design inspiration
  - [ ] Search for password manager patterns
  - [ ] Document UI decisions and references
- [ ] **[Future]** Full UI design project
  - Design system specification
  - Component library design
  - Note: For now, use existing shadcn setup which is sufficient

### Components Needed (Prioritized)

- [ ] Input (text, password with reveal)
- [ ] Form (with validation)
- [ ] Dialog/Modal
- [ ] Dropdown/Select
- [ ] Toast/Notification
- [ ] Card
- [ ] Tabs
- [ ] Skeleton loaders

---

## Password Management

- [ ] View passwords (UI exists with mock data only)
- [ ] Search passwords (UI exists, not connected to real data)
- [ ] Add passwords
- [ ] Edit passwords
- [ ] Delete passwords
- [ ] Password generator
- [ ] Password strength indicator
- [ ] **[Future]** Password breach checking (HaveIBeenPwned API - k-anonymity)
- [ ] **[Future]** Custom fields support (notes, URLs, custom key-value)

### Password Organization (from password-organization.md)

- [ ] Folder system with icons
  - [ ] Folder CRUD operations
  - [ ] Hierarchical folder tree UI
  - [ ] Folder management page
  - [ ] Inline subfolder creation
  - [ ] Move folder to different parent
- [ ] **[Future]** Tag system with colors
  - [ ] Tag CRUD operations
  - [ ] Tag groups (Status, Topic, Environment, Access)
  - [ ] Tag management page grouped by category
  - [ ] Color picker for tags
- [ ] **[Future]** Global Library
  - [ ] Bundled JSON with predefined folders/tags (static, ships with extension)
  - [ ] IndexedDB seeding on first launch
  - [ ] Auto-suggest from library when creating tags/folders
  - Note: Library updates delivered via extension updates, not server
- [ ] **[Future]** Onboarding archetypes
  - [ ] "Standard" template (Work, Personal, Finance)
  - [ ] "Developer" template (Projects, Infrastructure, Keys)
  - [ ] "Family" template (Household, School, Medical)
  - [ ] Template selection UI during first setup

---

## Sync & Storage (from sync-strategy.md)

### Cloud Vault Structure

```
vault.encrypted (in S3/GCS/Azure):
├── header (unencrypted, minimal)
│   └── version (schema compatibility only)
└── payload (encrypted with master password)
    ├── metadata
    │   ├── lastModified
    │   └── devices[] (for audit/client-enforced access)
    ├── passwords[]
    ├── folders[]
    └── tags[]
```

> **Why encrypt metadata?** Device list, timestamps, and activity patterns are sensitive.
> We don't rely on provider-native metadata to maintain portability across S3/GCS/Azure/MinIO/etc.

### Sync Flow

- [ ] Manual sync button
- [ ] Download remote vault snapshot
- [ ] Compare local vs remote (diff algorithm runs locally)
- [ ] Auto-resolve non-conflicting changes
- [ ] Upload merged vault

### Conflict Resolution

- [ ] Conflict detection (both modified, deleted but modified)
- [ ] Diff UI showing local vs remote versions
- [ ] Per-item resolution (use local / use remote / skip)
- [ ] Masked password display with reveal option
- [ ] Apply resolutions button

### Sync States

- [ ] Idle, checking, downloading, comparing, conflicts, uploading, complete, error
- [ ] Sync progress indicator
- [ ] Sync summary after completion

### Advanced Sync

- [ ] **[Future]** Auto-sync on unlock (optional setting, triggers on local event)
- [ ] **[Future]** Sync history log (stored in cloud vault metadata, grows over time - consider rotation)
- [ ] **[Future]** Handle offline scenarios (queue changes, sync when online)
- [ ] **[Future]** Handle master password change
  - Detection: decryption fails with current key
  - Action: prompt user for new master password, re-derive key
- [ ] **[Future]** Atomic upload
  - S3: upload to temp key, then copy to final key
  - Note: verify atomic rename support per provider
- [ ] **[Future]** Version migration strategy (when vault schema changes)
- [ ] **[Future]** Backup before destructive sync operations

---

## Multi-Device Setup (from multi-device-setup.md)

### Device Transfer Methods

- [ ] QR code transfer
  - [ ] Generate QR with encrypted provider config
  - [ ] Include `createdAt` and `expiresAt` timestamps in payload
  - [ ] Receiver validates `expiresAt > Date.now()` before using
  - [ ] Optional PIN adds encryption layer to QR payload
  - [ ] QR scanner UI
  - **Limitation**: Expiration is client-validated only. Protects against stale QR codes but not real-time interception. PIN encryption recommended for sensitive transfers.
- [ ] Configuration export file
  - [ ] Export `spm-config.encrypted` file (encrypted with master password)
  - [ ] Import config file UI
  - [ ] Decrypt with master password
  - Note: User responsible for secure file transfer
- [ ] Manual configuration
  - [ ] Provider selection dropdown
  - [ ] Bucket/container name input
  - [ ] Region selection
  - [ ] Access credentials input
  - [ ] Test connection button

### Device Management

> With device key authentication (see Security Features), device management
> provides cryptographic access control, not just audit trail.

- [ ] Generate unique device ID on first setup (stored locally)
- [ ] Generate device key pair on first setup (see Device Key Authentication)
- [ ] Device name (user-editable, stored in cloud vault)
- [ ] Device registry in cloud vault:
  - [ ] Device ID
  - [ ] Device name
  - [ ] Public key (JWK format)
  - [ ] Last sync timestamp
  - [ ] Created date
- [ ] "Remove device" removes public key from registry (cryptographic revocation)
- [ ] Show warning for devices not synced in 30+ days

### Access Revocation

**Single device compromised:**

1. Remove device's public key from vault registry
2. Device can no longer sync (signature verification fails)
3. No need to change master password

**Master password compromised:**

1. Change master password (re-encrypts entire vault)
2. All devices must re-authenticate with new password
3. Device keys remain valid (optional: force key rotation)

**Full compromise (device + master password):**

1. Change master password
2. Revoke compromised device key
3. Rotate cloud credentials (new S3 keys, etc.)

### Platform Portability **[Future]**

> **Constraint**: Browser extensions do not work on mobile browsers (Chrome/Safari mobile).
> This is a fundamental limitation of the extension approach.

#### Current Support

- [ ] Chrome Desktop (primary target) - **In Scope**
- [ ] Firefox Desktop
- [ ] Edge Desktop (Chromium-based)
- [ ] Brave Desktop (Chromium-based)
- [ ] Safari Desktop (requires WebExtension API subset)

#### Mobile Access Options

- [ ] **Option A: PWA Companion** (Recommended for MVP)
  - Separate PWA that reads same cloud vault
  - Limited to view/copy passwords (no autofill)
  - Must handle same encryption/decryption
  - Shares cloud credentials with extension
- [ ] **Option B: Native Mobile App**
  - React Native or Flutter
  - Full functionality including biometric unlock
  - Requires separate development effort
- [ ] **Option C: Web Vault Portal** (Simplest)
  - Static site hosted on user's cloud
  - View-only access to passwords
  - Least secure (relies on HTTPS only)

#### Cross-Browser Considerations

- [ ] Manifest V3 vs V2 compatibility (Firefox still supports V2)
- [ ] Storage API differences
- [ ] Content script injection differences
- [ ] Extension store publishing requirements per browser

---

## Security Features

- [ ] Master password setup/unlock flow
- [ ] Key derivation (PBKDF2 with 600,000 iterations, or Argon2 via WASM)
- [ ] AES-256-GCM encryption
- [ ] Secure key storage (in-memory only, cleared on lock)
- [ ] Auto-lock after inactivity timeout
- [ ] Password expiration warnings (calculated locally from password metadata)
- [ ] Multi-factor authentication for cloud providers (configured in provider, not our app)

Note: MFA for the vault itself (TOTP/HOTP) would require secure storage of TOTP secret,
which has same security as master password. Consider if this adds real value.

### Encryption Implementation Details

- [ ] PBKDF2-SHA256 with 600,000 iterations (OWASP 2023 recommendation)
- [ ] Alternative: Argon2id via WASM (if performance acceptable)
- [ ] AES-256-GCM for symmetric encryption
- [ ] Random IV generation per encryption operation
- [ ] Key stored in memory only (never persisted)
- [ ] Clear key on:
  - Extension lock
  - Browser close
  - Inactivity timeout (configurable)

### Threat Model

> Document what we protect against and explicit limitations

| Threat                             | Protected | Notes                     |
| ---------------------------------- | --------- | ------------------------- |
| Remote attacker (no device access) | Yes       | Encryption at rest        |
| Cloud provider reads data          | Yes       | Client-side encryption    |
| Network eavesdropping              | Yes       | HTTPS + client encryption |
| Malicious extension update         | Partial   | User must verify updates  |
| Physical device access (locked)    | Yes       | Master password required  |
| Physical device access (unlocked)  | No        | Key in memory             |
| Browser memory dump                | No        | Key in memory             |
| Compromised master password        | No        | Need password rotation    |
| Single device compromised          | Yes       | Revoke device key only    |
| Keylogger on device                | No        | Out of scope              |

### Key Management

- [ ] Master password never stored (only derived key in memory)
- [ ] Key derivation on every unlock
- [ ] No password recovery possible (by design)
- [ ] Password change requires:
  - Re-derive new key
  - Re-encrypt entire vault
  - Update cloud vault
  - Notify other devices on next sync

### Device Key Authentication (SSH-like)

> Per-device asymmetric key pairs enable selective device revocation without
> changing the master password. Demonstrates WebCrypto's asymmetric capabilities.

- [x] Generate dual key pairs on device setup (WebCrypto `generateKey`)
  - [x] Ed25519 signing key pair (device identity)
  - [x] ECDH P-256 exchange key pair (key slot access)
  - [x] Private keys wrapped with Master KEK (AES-256-GCM A256GCMKW), stored in IndexedDB (non-extractable when unwrapped)
  - [ ] Public keys stored in cloud vault's device registry
- [ ] Device authentication flow:
  - [ ] On sync, device signs a challenge with private key
  - [ ] Other devices/vault verify signature with stored public key
  - [ ] Reject sync from unknown or revoked device keys
- [ ] Device revocation:
  - [ ] Remove public key from vault's device registry
  - [ ] Revoked device cannot sync (signature verification fails)
  - [ ] No need to change master password for single-device revocation
- [ ] Key rotation:
  - [ ] Generate new key pair on device
  - [ ] Update public key in vault (requires valid existing key)
  - [ ] Old key immediately invalid

#### Security Properties

| Scenario                 | With Device Keys                        | Without (Current)               |
| ------------------------ | --------------------------------------- | ------------------------------- |
| Lost device              | Revoke device key only                  | Must change master password     |
| Stolen device (locked)   | Revoke device key                       | Revoke + change master password |
| Stolen device (unlocked) | Attacker has private key - still revoke | Same as above                   |
| Adding new device        | Generate key pair, add public key       | Share master password           |

#### Implementation Notes

- Uses WebCrypto `subtle.generateKey()` for Ed25519 (signing) and ECDH P-256 (exchange)
- Private keys wrapped with Master KEK (AES-256-GCM A256GCMKW), marked non-extractable when unwrapped
- Public keys exported as JWK for storage in vault
- Algorithm suite system allows future algorithm changes (see docs/security/security-specification.md §3.0)

---

## Import/Export **[Future]**

- [ ] Import passwords from CSV
- [ ] Import from Bitwarden (folder mapping per password-organization.md)
- [ ] Export passwords to CSV (encrypted zip with password)
- [ ] Template import/export (JSON schema validation, local files only)

---

## Browser Integration

- [ ] Autofill functionality (content scripts)
- [ ] Auto-detect login forms
- [ ] Context menu "Generate password"
- [ ] **[Future]** Keyboard shortcuts (Ctrl+Shift+P to open, etc.)
- [ ] **[Future]** Badge icon showing status (locked/unlocked/sync status)
- [ ] **[Future]** Notification for password copied
- [ ] **[Future]** "Save this password?" prompt after form submission
- [ ] **[Future]** Site matching logic (domain, subdomain handling)
- [ ] **[Future]** Multiple credentials per site handling

---

## Infrastructure

- [x] AWS CloudFormation template (providers/aws/s3-cognito.template.yaml)
  - S3 bucket with encryption
  - Cognito Identity Pool (for temporary S3 credentials, not app auth)
  - IAM Role with minimal S3 permissions (single bucket only)
- [ ] Test AWS CloudFormation template deployment
- [ ] **[Future]** Add CI/CD pipeline (GitHub Actions) - extension hosting
- [ ] **[Future]** Add automated testing for adapters

---

## Testing

> **Focus**: Security-focused tests that prove encryption safety and access point security.

- [x] Basic test setup (Vitest configured)
- [~] Background service worker test (basic test exists)

### Security Tests (In Scope)

- [x] Crypto adapter security tests
  - [x] Key derivation correctness (PBKDF2 parameters)
  - [x] Encryption/decryption round-trip integrity
  - [x] IV uniqueness per operation
  - [x] Key never persisted to storage
- [x] Device key security tests
  - [x] Dual key pair generation (Ed25519 + ECDH P-256)
  - [x] Private key non-extractable flag (both key types)
  - [x] Sign/verify round-trip (Ed25519)
  - [x] Signature verification fails with wrong key
  - [x] ECDH key agreement (mutual secret derivation)
  - [x] ECDH P-256 PKCS8 wrap/unwrap round-trip
  - [ ] Revoked device rejection
- [ ] Access point security tests
  - [ ] Master password validation
  - [ ] Key cleared on lock/timeout
  - [ ] Encrypted data format validation

### Functional Tests (In Scope)

- [ ] Unit tests for storage adapters
- [ ] Unit tests for sync logic
- [ ] Mock adapters for testing (in-memory implementations of all ports)

### **[Future]** Extended Testing

- [ ] Integration tests for extension workflows
- [ ] E2E tests for critical user flows

---

## Implementation Phases

### Pre-Implementation: Architecture Documentation

Before starting implementation phases, create comprehensive diagrams:

- [ ] **Relationship Diagram** (code-based, mindmap-style)
  - Tool: Mermaid, D2, or Graphviz (all support code-as-diagram)
  - Show high-level to detailed relationships
  - Document swappable components (adapters)
  - Format: Store in `docs/architecture/` as `.md` with embedded diagrams

Diagram should show:

1. **Top Level**: Extension <-> Cloud Storage <-> User's Cloud Account
2. **Mid Level**: Core <-> Adapters <-> External Services
3. **Detail Level**:
   - Core: Types, Ports, Use Cases
   - Adapters: Crypto, Storage (IndexedDB), Sync (S3/GCS/Azure), Auth
   - UI: Components -> Use Cases -> Ports
4. **Swappable Parts**: Highlight which adapters can be swapped

Suggested diagram structure:

```
docs/architecture/
├── system-overview.md      # High-level diagram
├── core-layer.md           # Core types and ports
├── adapters-layer.md       # Adapter implementations
├── data-flow.md            # Sequence diagrams for key flows
└── swappable-components.md # What can be replaced
```

### Phase 1: Core Types & Architecture ✓

- [x] Password, Folder types
- [x] **[Future]** Tag types
- [x] Crypto port interface
- [x] Storage port interface
- [x] Vault types (envelope, metadata, snapshot, encrypted-payload)
- [x] Device key types and port
- [x] Session types
- [x] Sync port and types
- [x] Crypto domain restructured (algorithms/, formats/, keys/, profiles/, suites/)

### Phase 2: Local Storage (In Progress)

- [ ] IndexedDB adapter (Dexie.js)
- [x] Web Crypto adapter (`web-crypto-api.adapter.ts` - PBKDF2, AES-256-GCM, key wrapping)
- [x] Device key adapter (Ed25519 + ECDH P-256 dual key pairs, AES-256-GCM wrapping)
- [ ] Master password flow (derive Master KEK, store in memory)
- [ ] Device registration (generate dual key pairs, wrap with Master KEK, store in IndexedDB)

### Phase 3: Password CRUD

- [ ] Add/edit/delete passwords
- [ ] Folder organization
- [ ] **[Future]** Tag assignment
- [ ] Search and filter

### Phase 4: Cloud Sync

- [ ] S3 adapter implementation
- [ ] Basic sync (manual trigger)
- [ ] Conflict resolution UI

### Phase 5: Multi-Device **[Future]**

- [ ] QR code transfer (with timestamp validation)
- [ ] Config export/import
- [ ] Device list (client-enforced)

### Phase 6: Polish **[Future]**

- [ ] Global Library seeding
- [ ] Onboarding flow with archetypes
- [ ] Import from other password managers
- [ ] Sync history/audit

---

## Notes from Research.tex

### Security Model (3 access points)

1. **Web Extension Interface** - Main user access, protected by master password
2. **IndexedDB** - Local encrypted storage
3. **Cloud Storage** - Remote encrypted storage (user's own bucket)

### Design Principles

- Simplicity (Prostota)
- Security (Bezpieczeństwo)
- Portability (Przenośność)

### Serverless Benefits

- No server to maintain or secure
- No server costs
- User owns their data completely
- No single point of failure
- Works offline (sync when online)

### Serverless Tradeoffs

- No real-time sync (pull-based only)
- No server-enforced access control
- Client must handle all conflict resolution
- Recovery requires master password (no "forgot password" flow possible)
