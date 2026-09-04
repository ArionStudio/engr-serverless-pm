# Port, adapter, and runtime-validation standards

## BOUNDARY-001: Keep ports technology-neutral

- **Requirement:** Core ports MUST describe the capability core needs and MUST
  NOT expose browser, IndexedDB, AWS SDK, or other provider-specific types.
- **Scope:** Core ports.
- **Reason:** A port is the boundary between policy and delivery technology.
- **Compliant:** Represent provider configuration as validated `JsonValue`.
- **Noncompliant:** Accept an AWS SDK request object in a core use case.
- **Enforcement:** Port signature and dependency review.
- **Exceptions:** None.

## BOUNDARY-002: Decode hostile values from unknown

- **Requirement:** Persistence, transport, message, and provider values MUST
  enter an adapter codec as `unknown` and MUST be fully decoded before core use,
  downstream cryptography, or writes.
- **Scope:** Every runtime trust boundary.
- **Reason:** TypeScript declarations do not validate runtime data.
- **Compliant:** Parse JSON to `unknown`, validate it, then construct the domain
  record.
- **Noncompliant:** Cast `JSON.parse(text)` to `VaultSnapshot`.
- **Enforcement:** Codec tests with malformed artifacts.
- **Exceptions:** Values constructed and retained within one typed in-memory
  operation without crossing a runtime boundary.

## BOUNDARY-003: Give each artifact family one codec owner

- **Requirement:** Each persisted or transported artifact family MUST have one
  codec owner. Shared codec helpers MUST stay narrow and primitive. Unrelated
  families MUST NOT be merged into a storage-wide codec.
- **Scope:** Extension codecs.
- **Reason:** Artifact-specific invariants and versions need a clear owner.
- **Compliant:** Separate codecs for snapshots, session material, and enrollment
  artifacts.
- **Noncompliant:** One universal codec that switches over every database table.
- **Enforcement:** Codec organization and export review.
- **Exceptions:** Shared validation for primitive encodings such as exact byte
  arrays.

## BOUNDARY-004: Validate exact artifact structure

- **Requirement:** A codec MUST enforce the accepted version, fields, types,
  numeric ranges, duplicate rules, canonical encodings, branded byte lengths,
  and suite-specific key importability. Unknown versions and impossible
  discriminants MUST fail closed.
- **Scope:** Runtime codecs and provider outcome decoders.
- **Reason:** Partially decoded artifacts can acquire a valid signature or be
  persisted under a different meaning.
- **Compliant:** Reject duplicate device identities before importing keys.
- **Noncompliant:** Ignore unknown fields in a signed object and re-sign it.
- **Enforcement:** Exhaustive malformed-input and round-trip tests.
- **Exceptions:** Explicit extension fields defined by the owning specification.

## BOUNDARY-005: Keep provider validation in its adapter

- **Requirement:** Provider-specific configuration and error interpretation MUST
  stay in the provider adapter. Core MAY validate provider-neutral workflow
  facts again as defense in depth.
- **Scope:** Sync adapters and core sync workflows.
- **Reason:** Core must not become coupled to one provider's schema or error
  vocabulary.
- **Compliant:** The AWS adapter validates bucket and credential fields.
- **Noncompliant:** Core branches on an AWS `AccessDenied` exception class.
- **Enforcement:** Import and error-mapping review.
- **Exceptions:** Provider identifiers intentionally exposed as neutral domain
  values.

## BOUNDARY-006: Clone mutable boundary values

- **Requirement:** An adapter MUST detach every mutable DTO component before
  returning it or retaining it across asynchronous work. Before an `await`,
  callers MUST make an owned snapshot of every mutable descendant used by an
  authorization comparison, using the artifact's established clone operation.
  A documented immutable value type MAY be retained by reference.
- **Scope:** Adapters, repositories, and provider calls.
- **Reason:** External mutation must not change the object that a CAS or review
  approved.
- **Compliant:** Clone descriptors, nested vectors, tags, and byte arrays.
- **Noncompliant:** Return an internal repository object's version-vector
  reference.
- **Enforcement:** Alias-mutation tests.
- **Exceptions:** Immutable platform objects with a documented contract.

## BOUNDARY-007: Implement the port without changing its meaning

- **Requirement:** A concrete adapter MUST implement the complete port contract
  without changing its caller-visible meaning. Retries, fallback values,
  caching, normalization, or other behavior that can change observable results
  MUST be assigned by the port or an owning specification.
- **Scope:** Concrete implementations of core ports.
- **Reason:** Replacing an adapter must not silently change application
  behavior.
- **Compliant:** `SystemClockAdapter.now()` delegates on every call and returns
  the platform value unchanged.
- **Noncompliant:** An identifier adapter falls back to `Math.random()` when
  `crypto.randomUUID()` fails.
- **Enforcement:** Port-to-adapter review and contract tests.
- **Exceptions:** Provider-specific validation and normalization explicitly
  assigned by a port, as described by `BOUNDARY-005`.

## BOUNDARY-008: Keep portable failure contracts in core

- **Requirement:** A failure that core or a caller must recognize regardless of
  the concrete implementation MUST be defined by its core owner and documented
  by the port. An adapter MUST map implementation failures to that core-owned
  error or outcome.
- **Scope:** Port failures used for workflow decisions, user correction, or
  caller-visible handling.
- **Reason:** Callers must not import a Chrome, AWS, storage, or library adapter
  to understand a portable capability failure.
- **Compliant:** A BIP39 adapter rejects malformed recovery words with the
  core-owned `InvalidRecoveryMnemonicError`.
- **Noncompliant:** UI code imports an error class from `ScureBip39Adapter` to
  detect an invalid recovery phrase.
- **Enforcement:** Port documentation, error exports, dependency direction, and
  caller tests.
- **Exceptions:** None.

## BOUNDARY-009: Limit adapter-owned errors to adapter representations

- **Requirement:** An adapter MAY own an error only when it describes an
  adapter-specific persisted representation, transport record, or provider
  response that has no portable workflow meaning. Core MUST NOT import or
  branch on that error.
- **Scope:** Codec, storage, transport, browser, and provider adapter errors.
- **Reason:** Adapter-specific diagnostics are useful at their boundary, but
  promoting them into application behavior couples core to one implementation.
- **Compliant:** An IndexedDB codec owns a static error for a malformed local
  storage record while core treats the repository rejection as a dependency
  failure.
- **Noncompliant:** A WebCrypto adapter defines the only public error for a
  recovery failure shared by every client.
- **Enforcement:** Error-owner and import review.
- **Exceptions:** If a failure gains portable workflow meaning, move its
  contract to core before callers depend on it.

## BOUNDARY-010: Keep adapter construction inert and explicit

- **Requirement:** Adapter constructors MUST only retain explicit dependencies
  and immutable configuration. They MUST NOT read or write application data,
  start listeners, schedule work, or register themselves globally. Platform
  and library seams SHOULD use the narrowest useful injected interface.
- **Scope:** Concrete adapters and adapter factories.
- **Reason:** Composition must be reviewable and tests must replace platform
  behavior without replacing the adapter itself.
- **Compliant:** `WebCryptoIdAdapter` accepts
  `Pick<Crypto, "randomUUID">` and calls it only from `generateId()`.
- **Noncompliant:** A repository constructor opens storage, reads records, and
  installs a global singleton.
- **Enforcement:** Constructor review and deterministic adapter tests.
- **Exceptions:** A runtime API that requires asynchronous setup may use an
  explicit factory whose name and return type expose that setup. A Chrome
  storage repository may begin its required access-level restriction during
  construction when it retains the promise and every data operation awaits the
  same promise.

## BOUNDARY-011: Let composition own adapter lifetimes

- **Requirement:** Composition code MUST construct adapter instances and pass
  them explicitly. It MUST reuse the exact instance when correctness depends on
  instance state or identity, as required by `CORE-ARCH-014`, and MUST NOT use a
  module namespace or service locator as a singleton mechanism.
- **Scope:** Extension composition roots and runtime-specific composition
  functions.
- **Reason:** Instance lifetime is an application decision, not an import
  side effect.
- **Compliant:** One scheduled-task graph shares its clipboard coordinator and
  session service while a separate browser context creates its own graph.
- **Noncompliant:** `import * as Services` is treated as proof that consumers
  share one service instance.
- **Enforcement:** Composition review and identity-sensitive concurrency tests.
- **Exceptions:** Immutable module constants and pure function collections
  allowed by `CORE-ARCH-015`.

## BOUNDARY-012: Keep third-party APIs behind the adapter

- **Requirement:** A third-party adapter dependency MUST remain an
  implementation detail. Core ports, domain types, and portable errors MUST NOT
  expose that dependency's types or exceptions. A dependency whose output
  defines LFSPM cryptographic or interoperable protocol bytes also requires
  approval under `REPO-002`, an exact reviewed version, and browser-bundle
  validation when used by the extension.
- **Scope:** Adapters backed by SDKs or external libraries.
- **Reason:** Library upgrades must not rewrite core contracts, and protocol
  code needs a reviewable dependency and bundle boundary.
- **Compliant:** `ScureBip39Adapter` accepts core recovery types and keeps
  `@scure/bip39` inside the extension package.
- **Noncompliant:** `Bip39Port` accepts a wordlist type exported by
  `@scure/bip39` or leaks its native exception to callers.
- **Enforcement:** Manifest, lockfile, import, public-export, error-graph, and
  production-bundle review.
- **Exceptions:** A dependency may move to a shared adapter package after a real
  second client needs the same implementation; core remains independent.

## BOUNDARY-013: Distinguish ports from adapters by name

- **Requirement:** A core port interface MUST use the `CapabilityPort` name
  pattern and live in `capability.port.ts`. A concrete implementation in an
  adapter layer MUST use the shortest `TechnologyCapabilityAdapter` class name
  that identifies both its technology and capability, and MUST live in
  `technology-capability.adapter.ts`. A supporting boundary module that does not
  implement a port MUST use its precise role suffix, such as `.codec.ts` or
  `.type.ts`, and MUST NOT use `.port.ts` or the `Adapter` class suffix.
- **Scope:** Core ports, concrete adapters, and adapter-support modules.
- **Reason:** Names must reveal whether a module declares an application
  contract, implements one with a technology, or supports an implementation.
- **Compliant:** `ClockPort` lives in `clock.port.ts`, while
  `SystemClockAdapter` lives in `system-clock.adapter.ts`.
- **Noncompliant:** A concrete WebCrypto implementation is named
  `WebCryptoPort` and stored in `adapters/crypto/web-crypto.port.ts`.
- **Enforcement:** Filename, exported-symbol, barrel, and import review; an
  automated naming check SHOULD be added when the adapter tree is reconciled.
- **Exceptions:** Runtime and framework entry points use their required naming.
  A boundary component that is not a port implementation uses its actual role,
  such as `JsonTextDeviceEnrollmentTransport` in a `.transport.ts` module. A
  portable core service that implements a port follows the core service naming
  rules instead; `RandomVaultDisplayNameService` is the current example.
