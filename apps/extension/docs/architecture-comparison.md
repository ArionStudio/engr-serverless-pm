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

### 4.6 MVC (Model-View-Controller)

**What It Is**: Classic pattern separating data (Model), presentation (View), and logic (Controller). Controller handles user input and updates Model, which notifies View of changes. Originated in Smalltalk, popularized by web frameworks.

**Structure**:

```
src/
├── models/
│   ├── password.model.ts
│   ├── vault.model.ts
│   └── sync.model.ts
├── views/
│   ├── password-list.view.tsx
│   ├── password-form.view.tsx
│   └── settings.view.tsx
├── controllers/
│   ├── password.controller.ts
│   ├── vault.controller.ts
│   └── sync.controller.ts
└── services/
    ├── crypto.service.ts
    └── storage.service.ts
```

**General Pros**:

- Well-understood pattern with decades of documentation
- Clear separation between data and presentation
- Easy to reason about data flow

**General Cons**:

- Controller concept doesn't map naturally to React's component model
- Often leads to "fat controllers" with too much logic
- Bidirectional data flow can cause update cycles

**SPM Pros**:

- Familiar to developers from backend or traditional web development
- Models can encapsulate password/vault business rules

**SPM Cons**:

- **Controllers are awkward in React**—hooks and components handle what controllers would do
- No natural place for crypto abstraction—ends up in services without clear interface
- Bidirectional updates between Model and View complicate state management
- Testing controllers requires mocking both Model and View interactions

---

### 4.7 MVVM (Model-View-ViewModel)

**What It Is**: Evolved from MVC for data-binding frameworks. ViewModel exposes observable state that View binds to. Model contains business logic, ViewModel transforms it for display. Popular in WPF, Angular, and Vue.

**Structure**:

```
src/
├── models/
│   ├── password.model.ts
│   └── vault.model.ts
├── views/
│   ├── password-list.view.tsx
│   └── settings.view.tsx
├── viewmodels/
│   ├── password-list.viewmodel.ts    # React hook
│   ├── password-form.viewmodel.ts
│   └── settings.viewmodel.ts
└── services/
    ├── crypto.service.ts
    └── storage.service.ts
```

**General Pros**:

- ViewModel maps naturally to React hooks
- Clear data transformation layer
- Good testability for ViewModels (pure logic)

**General Cons**:

- ViewModel can become a dumping ground for logic
- Services layer still needs its own organization
- Doesn't address infrastructure abstraction

**SPM Pros**:

- React hooks ARE ViewModels—`usePasswords()` is a ViewModel
- Easy to test hooks in isolation
- Familiar pattern for Angular/Vue developers joining project

**SPM Cons**:

- **Doesn't solve crypto/storage abstraction**—services are direct implementations
- No interface layer for mocking crypto in tests
- Provider switching requires changes in services AND ViewModels
- Security code scattered across services without clear boundaries

---

### 4.8 Onion Architecture

**What It Is**: Concentric layers with domain at the center. Dependencies point inward. Very similar to Hexagonal but emphasizes the "onion" visualization: Domain Core → Domain Services → Application Services → Infrastructure. Jeffrey Palermo's refinement of ports/adapters.

**Structure**:

```
src/
├── domain/                      # Inner core - no dependencies
│   ├── entities/
│   │   ├── password.entity.ts
│   │   └── vault.entity.ts
│   └── services/
│       └── password-validation.service.ts
├── application/                 # Application services
│   ├── password.service.ts
│   └── sync.service.ts
├── infrastructure/              # Outer layer - external dependencies
│   ├── crypto/
│   │   └── web-crypto.ts
│   ├── storage/
│   │   └── indexeddb.ts
│   └── sync/
│       ├── s3.ts
│       └── gcs.ts
└── ui/                          # Presentation
    ├── components/
    └── hooks/
```

**General Pros**:

- Clear dependency direction (always inward)
- Domain isolation similar to Hexagonal
- Well-documented pattern

**General Cons**:

- Very similar to Hexagonal—choosing between them is often arbitrary
- "Domain Services" vs "Application Services" distinction can be confusing
- More layers than strictly necessary

**SPM Pros**:

- Same benefits as Hexagonal for crypto/storage isolation
- Domain entities can enforce password validation rules
- Infrastructure layer is clearly separated

**SPM Cons**:

- **Distinction from Hexagonal is minimal**—adds complexity without clear benefit
- Domain Services layer often empty in small projects
- Four named layers vs Hexagonal's simpler core/adapters mental model

---

### 4.9 Modular Monolith

**What It Is**: Application divided into loosely coupled modules, each with its own internal structure. Modules communicate through defined interfaces. Can use any internal architecture per module. Good middle ground between monolith and microservices.

**Structure**:

```
src/
├── modules/
│   ├── passwords/
│   │   ├── api/                 # Public interface
│   │   │   └── index.ts
│   │   ├── internal/            # Private implementation
│   │   │   ├── password.repository.ts
│   │   │   └── password.service.ts
│   │   └── ui/
│   │       └── password-list.tsx
│   ├── sync/
│   │   ├── api/
│   │   ├── internal/
│   │   └── providers/
│   │       ├── s3.provider.ts
│   │       └── gcs.provider.ts
│   └── crypto/
│       ├── api/
│       └── internal/
└── shared/
    └── types/
```

**General Pros**:

- Clear module boundaries with explicit public APIs
- Each module can evolve independently
- Good preparation for future extraction to separate packages

**General Cons**:

- Module boundaries require discipline to maintain
- Cross-module communication patterns need definition
- Can lead to duplication if shared code isn't managed well

**SPM Pros**:

- Crypto module has clear public API—easy to audit
- Sync providers naturally grouped in sync module
- Modules map to features (passwords, sync, settings)

**SPM Cons**:

- **Doesn't enforce ports/adapters within modules**—crypto module internals could still be hard to test
- Module communication overhead for small project
- Less strict than Hexagonal about dependency direction

---

### 4.10 Layered Architecture (N-Tier)

**What It Is**: Traditional horizontal layers where each layer only calls the layer directly below. Typically: Presentation → Business Logic → Data Access → Database. Simple and widely understood.

**Structure**:

```
src/
├── presentation/                # UI Layer
│   ├── components/
│   └── pages/
├── business/                    # Business Logic Layer
│   ├── password.service.ts
│   ├── vault.service.ts
│   └── sync.service.ts
├── data/                        # Data Access Layer
│   ├── password.repository.ts
│   ├── indexeddb.client.ts
│   └── s3.client.ts
└── shared/
    └── types/
```

**General Pros**:

- Simplest layered architecture to understand
- Clear top-to-bottom flow
- Easy onboarding for junior developers

**General Cons**:

- Dependencies flow downward—lower layers can't be easily swapped
- Business layer depends on Data layer interfaces
- Testing requires mocking entire lower layers

**SPM Pros**:

- Easy to understand and implement
- Quick to set up for small projects

**SPM Cons**:

- **Wrong dependency direction**—business logic depends on data access, not abstractions
- Swapping IndexedDB for another storage requires changes in Data AND Business layers
- Crypto implementation tightly coupled to business logic
- **Cannot mock crypto for testing** without significant refactoring
- Security code in business layer mixed with other logic

---

### 4.11 Component-Based Architecture

**What It Is**: React's natural organization pattern. Components are self-contained units with their own state, logic, and rendering. Shared logic extracted to hooks. No enforced layers—components import what they need.

**Structure**:

```
src/
├── components/
│   ├── password-list/
│   │   ├── password-list.tsx
│   │   ├── password-list.hooks.ts
│   │   └── password-list.styles.ts
│   ├── password-form/
│   │   ├── password-form.tsx
│   │   └── password-form.hooks.ts
│   └── sync-settings/
│       ├── sync-settings.tsx
│       └── sync-settings.hooks.ts
├── hooks/
│   ├── use-crypto.ts
│   ├── use-storage.ts
│   └── use-sync.ts
├── services/
│   ├── crypto.ts
│   └── storage.ts
└── types/
```

**General Pros**:

- Natural fit for React development
- Components are highly reusable
- Co-location of related code
- Fast iteration and prototyping

**General Cons**:

- No enforced boundaries—any component can import anything
- Business logic scattered across component hooks
- Services become grab-bags of utility functions

**SPM Pros**:

- Fastest to implement initially
- Components can be developed in isolation
- Hooks provide some abstraction

**SPM Cons**:

- **Crypto logic scattered across hooks**—`use-crypto.ts` called from multiple components
- No interface for mocking—tests must use real crypto or mock entire hooks
- Adding new sync provider requires updating multiple hooks
- **Security audit requires reviewing entire codebase**—no single crypto location
- Provider switching requires changes across many files

---

## 5. Comparison Matrix

Scoring each architecture against our weighted requirements (1-5 scale).

| Requirement                | Weight   | Hexagonal | Colocation | FSD | Clean | Vertical | MVC   | MVVM | Onion | Modular | Layered | Component |
| -------------------------- | -------- | --------- | ---------- | --- | ----- | -------- | ----- | ---- | ----- | ------- | ------- | --------- |
| Testability                | Critical | **5**     | 2          | 3   | 5     | 2        | 3     | 3    | 5     | 4       | 2       | 2         |
| Sync provider swappability | Critical | **5**     | 2          | 3   | 5     | 3        | 2     | 2    | 5     | 4       | 2       | 2         |
| Security isolation         | Critical | **5**     | 2          | 3   | 5     | 2        | 2     | 2    | 5     | 4       | 2       | 2         |
| Entry point sharing        | High     | **5**     | 4          | 3   | 4     | 3        | 4     | 4    | 5     | 4       | 4       | 3         |
| Contributor clarity        | High     | 4         | 3          | 3   | 3     | 3        | **5** | 4    | 3     | 4       | **5**   | 4         |
| Small team fit             | Medium   | 4         | **5**      | 3   | 3     | 4        | 4     | 4    | 3     | 3       | **5**   | **5**     |
| Low boilerplate            | Low      | 3         | **5**      | 3   | 2     | 4        | 3     | 3    | 2     | 3       | 4       | **5**     |

**Weighted Total** (Critical=3x, High=2x, Medium=1x, Low=0.5x):

| Architecture     | Score    |
| ---------------- | -------- |
| **Hexagonal**    | **60.5** |
| Onion            | 58.0     |
| Clean            | 56.5     |
| Modular Monolith | 51.5     |
| MVVM             | 42.5     |
| FSD              | 42.5     |
| MVC              | 42.0     |
| Colocation       | 40.0     |
| Layered          | 40.0     |
| Vertical         | 39.0     |
| Component-Based  | 38.5     |

---

## 6. Real-World Comparison

| Project                                                   | Pattern             | Core Location                  | Storage Abstraction                                                      | Ports/Interfaces |
| --------------------------------------------------------- | ------------------- | ------------------------------ | ------------------------------------------------------------------------ | ---------------- |
| [Bitwarden](https://github.com/bitwarden/clients)         | Hexagonal + Modular | `libs/common/` (TS) + Rust SDK | `common/angular` split per module                                        | Yes              |
| [Proton Pass](https://github.com/protonpass)              | Hexagonal           | `proton-pass-common/` (Rust)   | UniFFI + WASM bindings                                                   | Yes              |
| [1Password](https://agilebits.github.io/security-design/) | Hexagonal           | Rust core                      | [Typeshare](https://github.com/1Password/typeshare) generated interfaces | Yes              |
| [Buttercup](https://github.com/buttercup/buttercup-core)  | Hexagonal           | `buttercup-core` (TS)          | `Datasource` interface                                                   | Yes              |
| [Padloc](https://github.com/padloc/padloc)                | Modular Monolith    | `packages/core/`               | Direct package imports                                                   | No               |

### Bitwarden Structure

```
clients/
├── apps/browser, desktop, web, cli/
└── libs/
    ├── common/           # Framework-agnostic core
    ├── angular/          # Angular adapters
    └── auth/common, auth/angular/
```

Docs: [Architecture](https://contributing.bitwarden.com/architecture/clients/), [DI](https://contributing.bitwarden.com/architecture/clients/dependency-injection/)

### Proton Pass Structure

```
protonpass/
├── proton-pass-common/   # Rust core
├── proton-pass-mobile/   # UniFFI bindings
├── proton-pass-web/      # WASM bindings
└── android-pass, ios-pass/
```

### Padloc Structure

```
padloc/packages/
├── core/      # Domain + crypto
├── app/       # Web UI
├── server/    # Backend
└── electron, cordova/
```

---

## 7. Decision

### Choice: Pure Hexagonal Architecture

We choose Pure Hexagonal (Ports & Adapters) for the SPM extension.

### Why

1. **Scores highest on critical requirements**: Testability, provider swappability, and security isolation are non-negotiable for a password manager. Hexagonal scores 5/5 on all three.

2. **Real-world validation**: Bitwarden, Proton Pass, 1Password, Buttercup, and Padloc all isolate crypto in a core layer and use interface abstractions for storage/sync. We're following industry-proven patterns.

3. **Contributor-friendly for the right tasks**: Adding a sync provider is 2-3 files with a clear pattern. The interface contract serves as documentation.

4. **Entry points share code cleanly**: Popup, Options, and Background all import from the same `core/` and `adapters/`.

### Trade-off Accepted

**More files for simple features**. Theme toggle requires a port, adapter, and context wiring—6+ files for a simple preference.

### How We Mitigate

- **Lightweight variant**: No use-case classes. Core contains ports and types; business logic lives in hooks that consume ports.
- **Barrel exports**: `index.ts` files hide internal structure. Consumers import from `@/core/crypto`, not individual files.
- **Consistent pattern**: Every feature follows the same structure. Learn once, apply everywhere.

---

## 8. References

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
