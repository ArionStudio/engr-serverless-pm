# Public API and contract standards

## API-001: Use declared package paths

- **Requirement:** Production consumers MUST import core through declared
  package paths. They MUST NOT deep-import `packages/core/src`.
- **Scope:** Consumers outside `packages/core`.
- **Reason:** Source paths bypass the supported package contract.
- **Compliant:** Import a use case from `@lfspm/core` and a service from
  `@lfspm/core/services`.
- **Noncompliant:** Import `packages/core/src/services/session/...`.
- **Enforcement:** Import search and consumer type-checking.
- **Exceptions:** Core test fixtures may be imported from the approved
  `packages/core/src/__tests__/fixtures` path by cross-package tests.

## API-002: Keep the supported entry points narrow

- **Requirement:** The supported core entry points are `@lfspm/core`,
  `@lfspm/core/lib`, and `@lfspm/core/services`. New subpaths MUST have an
  approved consumer need.
- **Scope:** The core export map.
- **Reason:** Every entry point becomes a compatibility and tooling contract.
- **Compliant:** Add a reviewed service to the existing services whitelist.
- **Noncompliant:** Export `./domain/*` with a wildcard.
- **Enforcement:** Export-map and resolver tests.
- **Exceptions:** None.

## API-003: Export contracts from their owner

- **Requirement:** Stable shared contracts MUST be named and exported by their
  owning domain or port. Consumers MUST NOT recover a real contract with
  `Parameters<T>`, `ReturnType<T>`, or `Omit<T, ...>` tricks.
- **Scope:** Cross-module public contracts.
- **Reason:** Indirect extraction hides ownership and breaks when an unrelated
  signature changes.
- **Compliant:** Import `VaultSnapshotIdentity` from its domain owner.
- **Noncompliant:** Define it as `Parameters<SyncProviderPort["upload"]>[0]`.
- **Enforcement:** Type and API review.
- **Exceptions:** Local test helpers may infer a function's type without
  publishing it as a contract.

## API-004: Verify the consumer boundary

- **Requirement:** A package export change MUST include a consumer compile smoke
  that resolves every affected entry point. Runtime behavior MUST also be tested
  when the exported value executes code.
- **Scope:** Package exports, aliases, and public barrels.
- **Reason:** A declaration can exist while Vite or TypeScript resolves the
  subpath incorrectly.
- **Compliant:** Compile imports from root, `/lib`, and `/services` through the
  extension configuration.
- **Noncompliant:** Test only a relative source import inside core.
- **Enforcement:** Composition type-check fixture and resolver tests.
- **Exceptions:** None.

## API-005: Correct unreleased contracts in place

- **Requirement:** Before the first public release, incorrect APIs and persisted
  models MUST be corrected in place. Compatibility aliases, migration layers,
  parallel schema versions, and new version identifiers require explicit
  approval.
- **Scope:** Unreleased public and persisted contracts.
- **Reason:** Preserving unused pre-release shapes creates permanent complexity
  without a compatibility obligation.
- **Compliant:** Update the existing artifact decoder and all fixtures together.
- **Noncompliant:** Add schema version 2 solely to preserve local development
  data.
- **Enforcement:** Schema, export, and migration review.
- **Exceptions:** Explicitly approved compatibility work for released data.
