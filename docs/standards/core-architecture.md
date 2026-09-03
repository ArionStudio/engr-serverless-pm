# Core architecture standards

These rules apply to production code under `packages/core/src` unless a rule
states a broader scope.

## CORE-ARCH-001: Keep core platform-independent

- **Requirement:** Core MUST NOT depend on React, Chrome APIs, browser globals,
  IndexedDB, Dexie, AWS SDKs, concrete adapters, or runtime configuration.
- **Scope:** Core production code.
- **Reason:** Core workflows must remain portable and testable.
- **Compliant:** Depend on a `ClockPort`.
- **Noncompliant:** Call `Date.now()` or `chrome.storage` from core.
- **Enforcement:** Import checks, type-checking, and review.
- **Exceptions:** Standard ECMAScript APIs that do not access environment state.

## CORE-ARCH-002: Point dependencies inward

- **Requirement:** Runtime and UI code MAY depend on composition and adapters;
  adapters MAY depend on core; core MUST NOT import outward.
- **Scope:** The monorepo dependency graph.
- **Reason:** Technology choices must not control domain and application policy.
- **Compliant:** A Chrome repository implements a core repository port.
- **Noncompliant:** A core use case imports the Chrome repository.
- **Enforcement:** Import-boundary checks and review.
- **Exceptions:** None.

## CORE-ARCH-003: Express external capabilities as ports

- **Requirement:** Core MUST receive storage, cryptography, time, randomness,
  identifiers, clipboard, scheduling, and provider operations through explicit
  ports.
- **Scope:** Core operations with effects or environment input.
- **Reason:** The caller must supply and test every external capability.
- **Compliant:** Inject `CryptoPort` through a constructor.
- **Noncompliant:** Construct a WebCrypto adapter inside a use case.
- **Enforcement:** Constructor and import review.
- **Exceptions:** None.

## CORE-ARCH-004: Keep domain operations pure

- **Requirement:** Domain operations MUST NOT mutate inputs or perform I/O,
  randomness, time access, scheduling, or adapter construction.
- **Scope:** `packages/core/src/domain`.
- **Reason:** Domain results must depend only on explicit input.
- **Compliant:** Return a new vault with one entry changed.
- **Noncompliant:** Save the changed vault from the mutation helper.
- **Enforcement:** Unit tests and import review.
- **Exceptions:** None.

## CORE-ARCH-005: Give each use case one workflow

- **Requirement:** A use case MUST represent one caller-visible workflow.
- **Scope:** Core use cases.
- **Reason:** Public application behavior needs one clear owner.
- **Compliant:** `ChangeMasterPassword` owns that complete workflow.
- **Noncompliant:** A generic use case switches among unrelated commands.
- **Enforcement:** API and responsibility review.
- **Exceptions:** None.

## CORE-ARCH-006: Use one execution entry point

- **Requirement:** A use case SHOULD expose one public `execute` method and MAY
  expose command or result types required by callers.
- **Scope:** Core use-case classes.
- **Reason:** A uniform application boundary is easier to compose and test.
- **Compliant:** `execute(command): Promise<Result>`.
- **Noncompliant:** Several public methods expose partial steps of one workflow.
- **Enforcement:** Public API review.
- **Exceptions:** A documented caller contract that cannot be represented as one
  execution operation.

## CORE-ARCH-007: Do not call use cases from use cases

- **Requirement:** A use case MUST NOT construct or call another use case.
- **Scope:** Core use cases.
- **Reason:** Reusable work needs an owner below the caller workflow boundary.
- **Compliant:** Both use cases depend on the same service.
- **Noncompliant:** `EnrollDevice.execute` calls `SyncUpload.execute`.
- **Enforcement:** Import checks and review.
- **Exceptions:** None.

## CORE-ARCH-008: Put shared work in its owning layer

- **Requirement:** Shared pure work belongs in domain operations, coordinated
  reusable work in services, and external work behind ports.
- **Scope:** Core code organization.
- **Reason:** Reuse must not erase ownership or dependency direction.
- **Compliant:** Snapshot signing and atomic persistence live in the snapshot
  service.
- **Noncompliant:** Copy the signing sequence into enrollment and revocation.
- **Enforcement:** Duplication and responsibility review.
- **Exceptions:** None.

## CORE-ARCH-009: Require meaningful services

- **Requirement:** A service MUST own policy, coordination, security, or rollback
  behavior. It MUST NOT merely rename one port call.
- **Scope:** Core services.
- **Reason:** Pass-through services add indirection without an invariant.
- **Compliant:** A session service serializes activation and stale commits.
- **Noncompliant:** A service whose method only calls `repository.save`.
- **Enforcement:** Service responsibility review.
- **Exceptions:** None.

## CORE-ARCH-010: Enter core through use cases

- **Requirement:** UI components and runtime event handlers MUST invoke
  caller-visible workflows through use cases, not through internal services.
- **Scope:** Application consumers.
- **Reason:** Use cases own validation, sequencing, and public results.
- **Compliant:** A popup action calls `CopyEntryPassword.execute`.
- **Noncompliant:** The popup calls `ClipboardClearService` to reproduce a
  workflow.
- **Enforcement:** Consumer import review.
- **Exceptions:** Composition code may construct and inject services.

## CORE-ARCH-011: Keep package entry points explicit

- **Requirement:** Core MUST expose reviewed whitelists through declared package
  entry points rather than mirroring internal folders.
- **Scope:** Package exports and barrels.
- **Reason:** File placement must not accidentally create a public contract.
- **Compliant:** Export a composition dependency from `@lfspm/core/services`.
- **Noncompliant:** Add a wildcard export for `src/services/**`.
- **Enforcement:** Export-map and barrel review.
- **Exceptions:** None.

## CORE-ARCH-012: Export for a known consumer

- **Requirement:** A new public export MUST have a known external consumer and a
  supported import path.
- **Scope:** Core public API.
- **Reason:** Unused exports become accidental compatibility obligations.
- **Compliant:** Add the service required by the extension composition root.
- **Noncompliant:** Export every internal helper for possible future use.
- **Enforcement:** Consumer-boundary tests and review.
- **Exceptions:** None.

## CORE-ARCH-013: Keep internal domain mutations internal

- **Requirement:** Context-specific mutations, schemas, mappers, and policy
  helpers MUST NOT be exported through public domain barrels unless they form an
  accepted public contract.
- **Scope:** Domain barrels and package exports.
- **Reason:** Public types and internal policy change at different rates.
- **Compliant:** Export `Vault` while keeping `revokeDeviceFromVault` internal.
- **Noncompliant:** Re-export every file from a domain directory.
- **Enforcement:** Barrel review.
- **Exceptions:** None.

## CORE-ARCH-014: Preserve identity-sensitive dependencies

- **Requirement:** One JavaScript composition graph MUST reuse the exact instance
  of a dependency when it owns mutable state, a cache, a queue, coordination
  state, or instance-scoped leases. Stateless dependency-binding services MAY
  have multiple instances.
- **Scope:** Composition and internal service construction.
- **Reason:** Some correctness checks depend on object identity, while separate
  Chrome contexts necessarily use separate graphs.
- **Compliant:** Share one session service and its clipboard coordinator inside a
  background composition graph.
- **Noncompliant:** Construct a new coordinator after acquiring a lease from the
  old coordinator.
- **Enforcement:** Composition tests and identity-sensitive concurrency tests.
- **Exceptions:** Separate browser contexts coordinate through Web Locks,
  storage, or another cross-context port.

## CORE-ARCH-015: Keep dependencies visible

- **Requirement:** Dependencies MUST be supplied through constructors or explicit
  function parameters. Code MUST NOT use a mutable global registry, service
  locator, `getInstance`, or ambient singleton container.
- **Scope:** Core and composition code.
- **Reason:** Hidden dependencies make lifetime and identity impossible to
  review.
- **Compliant:** Construct a service with its five required ports.
- **Noncompliant:** Resolve a repository from a global token map.
- **Enforcement:** Search and composition review.
- **Exceptions:** Immutable module constants and pure function collections.

## CORE-ARCH-016: Limit domain dependencies

- **Requirement:** Domain code MUST NOT import ports, services, use cases,
  adapters, UI, or browser APIs.
- **Scope:** `packages/core/src/domain`.
- **Reason:** Domain rules must remain independent of orchestration and effects.
- **Compliant:** A domain policy imports another domain type.
- **Noncompliant:** A domain policy imports `CryptoPort`.
- **Enforcement:** Import-boundary checks.
- **Exceptions:** None.

## CORE-ARCH-017: Limit port dependencies

- **Requirement:** Ports MUST NOT import services or use cases.
- **Scope:** `packages/core/src/ports`.
- **Reason:** Ports describe capabilities required by core, not their
  orchestration.
- **Compliant:** A repository port refers to a port-owned persisted record.
- **Noncompliant:** A port method accepts a service-owned workflow object.
- **Enforcement:** Import-boundary checks.
- **Exceptions:** None.

## CORE-ARCH-018: Keep services below use cases

- **Requirement:** Services MUST NOT import or invoke use cases.
- **Scope:** `packages/core/src/services`.
- **Reason:** Services provide reusable actions to workflows, not the reverse.
- **Compliant:** A use case injects a service.
- **Noncompliant:** A service constructs `UnlockVault`.
- **Enforcement:** Import-boundary checks.
- **Exceptions:** None.

## CORE-ARCH-019: Keep core construction inert

- **Requirement:** Core MUST use relative internal imports, MUST NOT import its
  own package name, and MUST avoid runtime dependency cycles. Constructors MUST
  NOT perform I/O, start listeners or timers, schedule work, or retain secret
  input beyond explicit ownership.
- **Scope:** Core imports and constructors.
- **Reason:** Construction must build a reviewable graph without starting hidden
  work.
- **Compliant:** A constructor stores injected ports; `execute` performs I/O.
- **Noncompliant:** A constructor reads storage and arms an alarm.
- **Enforcement:** Import-cycle checks, tests, and constructor review.
- **Exceptions:** None.
