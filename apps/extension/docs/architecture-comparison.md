# Architecture Decision: Pure Hexagonal for SPM

> **Status**: Decision finalized
> **Date**: 2026-01-17
> **Choice**: Pure Hexagonal Architecture (Ports & Adapters)

---

## 1. Project Context

### 1.1 What We're Building

Serverless Password Manager (SPM) is a browser extension that stores encrypted passwords locally in IndexedDB. Users can optionally enable cloud sync by connecting their own S3/GCS/Azure bucket—no central server holds their data. All encryption happens client-side using the Web Crypto API.

### 1.2 Features

| Feature                   | Complexity | Notes                                                                       |
| ------------------------- | ---------- | --------------------------------------------------------------------------- |
| Master password unlock    | Complex    | Key derivation, session management                                          |
| Password CRUD             | Complex    | Encryption/decryption on every operation                                    |
| Password generator        | Simple     | Pure function, no external dependencies                                     |
| Local storage (IndexedDB) | Medium     | Primary encrypted storage                                                   |
| Cloud sync (optional)     | Complex    | Multiple provider implementations                                           |
| Import/Export CSV         | Medium     | Encryption before export                                                    |
| Password organization     | Medium     | Folders + tags (see [password-organization.md](./password-organization.md)) |
| Autofill                  | Complex    | Content scripts, DOM interaction                                            |
| Theme toggle              | Simple     | UI preference only                                                          |
| Settings management       | Simple     | Local preferences                                                           |

### 1.3 Tech Stack

| Technology   | Version | Purpose             |
| ------------ | ------- | ------------------- |
| React        | 19      | UI framework        |
| TypeScript   | 5.9     | Type safety         |
| Vite         | 7       | Build tool          |
| Base UI      | 1.0     | Headless components |
| Tailwind CSS | 4       | Styling             |
| Vitest       | -       | Testing             |

### 1.4 Extension Entry Points

| Entry Point         | Purpose                          | Shares Code With    |
| ------------------- | -------------------------------- | ------------------- |
| **Popup**           | Main password interface          | Options, Background |
| **Options**         | Settings, provider configuration | Popup, Background   |
| **Background**      | Service worker, sync operations  | Popup, Options      |
| **Content Scripts** | Autofill (future)                | Background          |

All entry points share the same crypto, storage, and business logic.

### 1.5 Key Assumptions

- **Crypto library extensibility**: Web Crypto API as default (PBKDF2 + AES-256-GCM). Architecture prepared for trusted external libraries (e.g., Argon2) via crypto port.
- **Local-first**: IndexedDB is the primary storage. Works fully offline.
- **Optional cloud sync**: Users can connect their own S3/GCS/Azure bucket for backup/sync across devices. No central server.
- **Serverless model**: No backend to maintain. Extension talks directly to local storage and optionally to cloud.
- **Small team**: 1-3 developers. Architecture must be learnable, not overwhelming.
- **Limited feature set**: ~10 features total. Not building for infinite extensibility.

---

## 2. Challenges

These are the problems our architecture must solve.

| Challenge                            | Why It Matters                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Security testing**                 | Crypto code must be testable without real encryption. We need to mock PBKDF2/AES-GCM for unit tests without touching the Web Crypto API. |
| **Multiple sync providers**          | If user enables cloud sync, they choose S3/GCS/Azure. Adding a new provider (e.g., MinIO) shouldn't require changing existing code.      |
| **Code sharing across entry points** | Popup, Options, and Background all need the same crypto and storage logic. Duplication creates security bugs.                            |
| **Contributor friendliness**         | Contributors should easily add new sync providers. Clear pattern, minimal files to change.                                               |
| **Security auditability**            | All encryption code must be in one place for security reviews. Scattered crypto = missed vulnerabilities.                                |
| **Encrypted metadata access**        | Metadata (tags, URLs) searchable in UI while passwords stay encrypted. Two-layer encryption.                                             |

---

## 3. Requirements (Weighted)

Prioritized list of what our architecture must provide.

| Requirement                    | Weight   | Description                                                                       |
| ------------------------------ | -------- | --------------------------------------------------------------------------------- |
| **Testability**                | Critical | Can mock crypto/storage for unit tests without real encryption                    |
| **Sync provider swappability** | Critical | Switch S3↔GCS↔Azure without rewriting business logic                              |
| **Security isolation**         | Critical | Crypto/auth code lives in a dedicated, auditable location                         |
| **Entry point sharing**        | High     | Popup/Options/Background share core logic without duplication                     |
| **Contributor clarity**        | High     | Clear pattern for adding features and sync providers                              |
| **Small team fit**             | Medium   | Learnable by 1-3 developers                                                       |
| **Low boilerplate**            | Low      | Structure is reasonable for security-critical project—not a priority to minimize. |

---

## 4. Architecture Options

### 4.1 Hexagonal Architecture (Ports & Adapters)

**What It Is**: Business logic lives in a pure `core/` layer that defines interfaces (ports). Infrastructure implementations (adapters) satisfy those interfaces. The UI consumes both through dependency injection. The core knows nothing about the outside world.

**Structure**:

```
src/
├── core/                    # Domain + Ports (pure, no dependencies)
│   ├── crypto/
│   │   ├── crypto.port.ts
│   │   ├── encrypted-data.type.ts
│   │   ├── password-crypto.type.ts   # Layer 1 (individual passwords)
│   │   └── vault-crypto.type.ts      # Layer 2 (metadata)
│   ├── storage/
│   │   └── storage.port.ts      # Local storage interface
│   ├── sync/
│   │   ├── sync.port.ts         # Cloud sync interface (optional)
│   │   └── sync-diff.type.ts    # Change detection types
│   └── passwords/
│       ├── password.type.ts
│       ├── password-repository.port.ts
│       ├── folder.type.ts
│       └── tag.type.ts
│
├── adapters/                # Implementations (external dependencies)
│   ├── crypto/
│   │   └── web-crypto.adapter.ts
│   ├── storage/
│   │   └── indexeddb.adapter.ts # Primary local storage
│   └── sync/                    # Optional cloud sync
│       ├── s3.adapter.ts
│       ├── gcs.adapter.ts
│       └── azure.adapter.ts
│
├── ui/                      # React components + wiring
│   ├── components/
│   ├── contexts/            # DI wiring
│   └── views/
│
└── extension/               # Entry points (bootstrap only)
    ├── popup/
    ├── options/
    └── background/
```

**General Pros**:

- Maximum testability through interface-based mocking
- Clear separation of concerns
- Easy to swap implementations
- Framework-agnostic core

**General Cons**:

- More files than simpler approaches
- Indirection can confuse newcomers
- Requires discipline to maintain boundaries

**SPM Pros**:

- Crypto ports can be mocked without touching Web Crypto API
- IndexedDB for local, S3/GCS/Azure for sync—all interchangeable implementations
- `core/crypto/` is one place to audit for security
- All entry points share the same `core/` and `adapters/`

**SPM Cons**:

- Theme toggle requires port/adapter (more files for simple feature)
- Learning curve for first-time contributors

---

### 4.2 Simple Colocation

**What It Is**: Everything related to a feature lives in one folder. No strict layers. Components, hooks, types, and API calls colocated together. Prioritizes simplicity and discoverability.

**Structure**:

```
src/
├── features/
│   ├── passwords/
│   │   ├── password-list.tsx
│   │   ├── use-passwords.ts
│   │   ├── encrypt.ts          # Direct Web Crypto calls
│   │   └── storage.ts          # Direct S3 calls
│   ├── sync/
│   │   ├── use-sync.ts
│   │   ├── s3.ts
│   │   ├── gcs.ts
│   │   └── azure.ts
│   └── theme/
│       ├── theme-toggle.tsx
│       └── use-theme.ts
│
└── entry-points/
    ├── popup/
    ├── options/
    └── background/
```

**General Pros**:

- Simplest mental model
- Fast iteration
- Easy onboarding
- Low file count

**General Cons**:

- No testing seam for mocking
- Cross-feature imports create coupling
- Hard to enforce boundaries

**SPM Pros**:

- Theme and settings are trivial to implement
- Fast iteration for UI changes

**SPM Cons**:

- **Cannot mock crypto** without dependency injection—testing requires real encryption
- **Provider switching is hard**—S3/GCS/Azure scattered across features
- **Security audit nightmare**—crypto code in multiple `features/*/encrypt.ts` files
- Cross-feature imports between `passwords/` and `sync/`

---

### 4.3 Feature-Sliced Design (FSD)

**What It Is**: Code organized by features with strict horizontal layers: `app > pages > widgets > features > entities > shared`. Each layer can only import from layers below. Originated from Yandex frontend community.

**Structure**:

```
src/
├── app/                     # Application initialization
├── pages/                   # Full page views
│   ├── popup/
│   └── options/
├── widgets/                 # Complex UI blocks
├── features/                # User actions
│   ├── copy-password/
│   └── generate-password/
├── entities/                # Business objects
│   ├── password/
│   └── vault/
└── shared/                  # Infrastructure
    ├── api/
    │   ├── crypto/
    │   └── storage/
    └── ui/
```

**General Pros**:

- Clear import rules prevent spaghetti
- Feature discovery is straightforward
- Scales to large teams

**General Cons**:

- 6 layers can be overkill
- Rigid hierarchy requires refactoring when boundaries shift

**SPM Pros**:

- Clear feature boundaries
- Community documentation available

**SPM Cons**:

- **6 layers for ~10 features is overkill**
- Crypto/storage must live in `shared/api`—awkward for ports/adapters pattern
- `pages/` concept doesn't map to popup/options/background
- No natural seam for mocking infrastructure in `shared/`

---

### 4.4 Clean Architecture

**What It Is**: Robert C. Martin's architecture with strict dependency rules: Entities → Use Cases → Interface Adapters → Frameworks. More explicit than Hexagonal about the "use case" layer. Use cases are classes that orchestrate domain logic.

**Structure**:

```
src/
├── domain/                  # Enterprise Business Rules
│   ├── entities/
│   └── value-objects/
├── application/             # Application Business Rules
│   ├── use-cases/
│   │   ├── decrypt-password.use-case.ts
│   │   └── sync-vault.use-case.ts
│   └── ports/
├── infrastructure/          # Frameworks & Drivers
│   ├── crypto/
│   └── storage/
├── presentation/            # Interface Adapters
│   ├── hooks/
│   └── components/
└── main/                    # Composition Root
```

**General Pros**:

- Maximum testability
- Self-documenting use case names
- Framework independence

**General Cons**:

- Most verbose option
- Class-heavy (conflicts with React's functional style)
- "use-case" naming conflicts with React's "use" hook prefix

**SPM Pros**:

- Use cases are pure classes, trivial to test
- `domain/` contains all security-critical logic

**SPM Cons**:

- **4 layers for ~10 features** is over-structured
- Class-based use cases don't compose naturally with React hooks
- More boilerplate than Hexagonal without clear benefit for this project size

---

### 4.5 Vertical Slice Architecture

**What It Is**: Each feature is a complete vertical slice through all layers. No horizontal sharing. Each slice is independent and could theoretically be deployed separately.

**Structure**:

```
src/
├── slices/
│   ├── view-passwords/
│   │   ├── view-passwords.component.tsx
│   │   ├── view-passwords.hook.ts
│   │   └── view-passwords.crypto.ts
│   ├── add-password/
│   │   ├── add-password.form.tsx
│   │   └── add-password.crypto.ts
│   └── sync-vault/
│       ├── sync-vault.hook.ts
│       ├── sync-vault.s3.ts
│       └── sync-vault.gcs.ts
│
└── shared/
    ├── crypto/
    └── storage/
```

**General Pros**:

- Feature independence
- Clear ownership
- Reduced cross-feature coupling

**General Cons**:

- Crypto/storage ends up duplicated or in shared anyway
- Hard to test slices that contain their own crypto

**SPM Pros**:

- Each slice developed/tested separately

**SPM Cons**:

- **Crypto duplication**—each slice needing encryption has its own `.crypto.ts`
- Storage providers still need `shared/` anyway, defeating the pattern
- Popup uses multiple slices, not one—doesn't map to entry points
- Testing still hard—internal crypto can't be easily mocked

---

## 5. Comparison Matrix

Scoring each architecture against our weighted requirements.

| Requirement                | Weight   | Hexagonal | Colocation | FSD | Clean | Vertical |
| -------------------------- | -------- | --------- | ---------- | --- | ----- | -------- |
| Testability                | Critical | **5**     | 2          | 3   | 5     | 2        |
| Sync provider swappability | Critical | **5**     | 2          | 3   | 5     | 3        |
| Security isolation         | Critical | **5**     | 2          | 3   | 5     | 2        |
| Entry point sharing        | High     | **5**     | 4          | 3   | 4     | 3        |
| Contributor clarity        | High     | **4**     | 3          | 3   | 3     | 3        |
| Small team fit             | Medium   | 4         | **5**      | 3   | 3     | 4        |
| Low boilerplate            | Low      | 3         | **5**      | 3   | 2     | 4        |

**Weighted Total** (Critical=3x, High=2x, Medium=1x, Low=0.5x):

| Architecture  | Score    |
| ------------- | -------- |
| **Hexagonal** | **60.5** |
| Clean         | 56.5     |
| Colocation    | 40.0     |
| FSD           | 42.5     |
| Vertical      | 39.0     |

---

## 6. Real-World Validation

Major password managers use the same patterns we're considering. Here's what we can learn.

| Project                                                      | Pattern Used                              | What We Learn                                                                              |
| ------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| **[Bitwarden](https://github.com/bitwarden/clients)**        | Crypto isolated in `libs/key-management/` | Security-critical code separate from UI = easier audits, single place to review            |
| **[Notesnook](https://github.com/streetwriters/notesnook)**  | `packages/crypto/` wraps libsodium        | Abstraction layer enables testing without real crypto operations                           |
| **[Buttercup](https://github.com/buttercup/buttercup-core)** | Datasource classes with common interface  | Easy to add new sync/storage backends (File, WebDAV, Dropbox) without changing vault logic |

**Conclusion**: All major password managers use ports/adapters for crypto and storage—regardless of what they call it. This validates our approach.

---

## 7. Decision

### Choice: Pure Hexagonal Architecture

We choose Pure Hexagonal (Ports & Adapters) for the SPM extension.

### Why

1. **Scores highest on critical requirements**: Testability, provider swappability, and security isolation are non-negotiable for a password manager. Hexagonal scores 5/5 on all three.

2. **Real-world validation**: Bitwarden, Notesnook, and Buttercup all use this pattern for crypto and storage. We're not inventing something new.

3. **Contributor-friendly for the right tasks**: Adding a sync provider is 2-3 files with a clear pattern. The interface contract serves as documentation.

4. **Entry points share code cleanly**: Popup, Options, and Background all import from the same `core/` and `adapters/`.

### Trade-off Accepted

**More files for simple features**. Theme toggle requires a port, adapter, and context wiring—6+ files for a simple preference.

### How We Mitigate

- **Lightweight variant**: No use-case classes. Core contains ports and types; business logic lives in hooks that consume ports.
- **Barrel exports**: `index.ts` files hide internal structure. Consumers import from `@/core/crypto`, not individual files.
- **Consistent pattern**: Every feature follows the same structure. Learn once, apply everywhere.

---

## 8. Implementation Rules

### When to Create a Port

Create a port (interface in `core/`) when:

- [ ] Feature involves encryption/decryption
- [ ] Feature involves authentication/authorization
- [ ] Feature has multiple implementations (sync providers)
- [ ] Feature interacts with external systems (browser APIs, IndexedDB, cloud services)
- [ ] Feature needs mocking for unit tests

### When to Create an Adapter

Create an adapter (implementation in `adapters/`) when:

- [ ] Implementing a port for a specific technology (Web Crypto, IndexedDB, S3, Cognito)
- [ ] Creating a mock for testing
- [ ] Supporting a new sync provider

### File Naming Conventions

```
core/
├── [domain]/
│   ├── [name].port.ts         # Interface definition
│   ├── [name].type.ts         # Types and value objects
│   └── index.ts               # Barrel export

adapters/
├── [domain]/
│   ├── [technology]-[name].adapter.ts  # Implementation
│   └── index.ts               # Barrel export
```

Examples:

- `core/crypto/crypto.port.ts`
- `adapters/crypto/web-crypto.adapter.ts`
- `adapters/storage/indexeddb-storage.adapter.ts`
- `adapters/sync/s3-sync.adapter.ts`

### Example: Adding a New Sync Provider

**Scenario**: Contributor wants to add Backblaze B2 support for cloud sync.

**Step 1**: Read the port interface

```typescript
// core/sync/sync.port.ts
export interface SyncPort {
  upload(key: string, data: Uint8Array): Promise<void>;
  download(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}
```

**Step 2**: Create the adapter

```typescript
// adapters/sync/b2-sync.adapter.ts
import type { SyncPort } from "@/core/sync";

export function createB2SyncAdapter(config: B2Config): SyncPort {
  return {
    async upload(key, data) {
      // B2-specific implementation
    },
    async download(key) {
      // B2-specific implementation
    },
    async delete(key) {
      // B2-specific implementation
    },
    async list() {
      // B2-specific implementation
    },
  };
}
```

**Step 3**: Export from barrel

```typescript
// adapters/sync/index.ts
export { createB2SyncAdapter } from "./b2-sync.adapter";
```

**Step 4**: Add to provider selection UI (if applicable)

**Files changed**: 2-3
**Files that DON'T change**: Core domain logic, other adapters, UI components using `useSync()`

### Example: Adding a New Crypto Library (Argon2)

**Scenario**: Adding Argon2 for key derivation alongside existing PBKDF2.

**Step 1**: Extend the port interface

```typescript
// core/crypto/crypto.port.ts
export interface CryptoPort {
  deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey>;
  // ... existing methods
}
```

**Step 2**: Create new adapter

```typescript
// adapters/crypto/argon2-crypto.adapter.ts
import type { CryptoPort } from "@/core/crypto";
import { hash } from "argon2-browser";

export function createArgon2CryptoAdapter(): CryptoPort {
  return {
    async deriveKey(password, salt) {
      const result = await hash({ pass: password, salt, type: 2 });
      return crypto.subtle.importKey("raw", result.hash, "AES-GCM", false, [
        "encrypt",
        "decrypt",
      ]);
    },
    // ... other methods delegate to Web Crypto
  };
}
```

**Step 3**: Wire in context

```typescript
// ui/contexts/crypto.context.tsx
const adapter = useArgon2
  ? createArgon2CryptoAdapter()
  : createWebCryptoAdapter();
```

**Files changed**: 2 (new adapter + context wiring)
**Core unchanged**: Port interface extended, not modified

---

## 9. Encryption Strategy

### Two-Layer Model

| Layer       | What                                | When Decrypted                       |
| ----------- | ----------------------------------- | ------------------------------------ |
| **Layer 1** | Individual passwords                | On explicit user action (copy, view) |
| **Layer 2** | Vault metadata (titles, tags, URLs) | Once on vault unlock                 |

**Why**: Metadata available for search without decrypting all passwords.

**Architecture**: `crypto.port.ts` supports both password-level and vault-level operations.

> Detailed encryption design to be documented when implementing crypto module.

---

## 10. Sync Strategy

User-controlled conflict resolution—no auto-merge for security-critical data.

**Architecture**: `sync.port.ts` + `sync-diff.type.ts` for provider interface and change detection.

See [sync-strategy.md](./sync-strategy.md) for detailed conflict resolution UI design.

---

## References

### Security Guidelines

- [OWASP: Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [MDN: Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

### Architecture Patterns

- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) - Alistair Cockburn
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) - Robert C. Martin

### Real-World Examples

- [Bitwarden](https://github.com/bitwarden/clients) - `libs/key-management/`
- [Notesnook](https://github.com/streetwriters/notesnook) - `packages/crypto/`
- [Buttercup](https://github.com/buttercup/buttercup-core) - Datasource abstraction
