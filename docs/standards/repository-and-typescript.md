# Repository and TypeScript standards

## REPO-001: Use the repository toolchain

- **Requirement:** Repository commands MUST use pnpm and MUST run from the
  repository root unless a command explicitly documents another directory.
- **Scope:** Development, validation, and automation commands.
- **Reason:** One package manager and one execution location keep lockfiles and
  workspace resolution deterministic.
- **Compliant:** `pnpm core:type-check` from the repository root.
- **Noncompliant:** `npm test` or running a root script from a package directory.
- **Enforcement:** Review command transcripts and CI scripts.
- **Exceptions:** Commands documented by a package as directory-specific.

## REPO-002: Do not add dependencies without approval

- **Requirement:** A change MUST NOT install or add a dependency without user
  approval. Existing platform and repository capabilities SHOULD be preferred.
- **Scope:** All manifests, lockfiles, vendored code, and runtime downloads.
- **Reason:** Dependencies change the security, maintenance, and bundle costs of
  the extension.
- **Compliant:** Implement the local password policy with the approved in-repo
  scorer.
- **Noncompliant:** Add `zxcvbn` because it shortens one implementation.
- **Enforcement:** Manifest and lockfile diff review.
- **Exceptions:** None.

## TS-001: Keep production types strict

- **Requirement:** Production code MUST compile under the repository's strict
  TypeScript settings and MUST NOT use the `any` type.
- **Scope:** TypeScript under `packages/` and `apps/`.
- **Reason:** Security-sensitive data must not pass through unchecked type holes.
- **Compliant:** Accept hostile input as `unknown` and narrow it with a codec.
- **Noncompliant:** Cast a stored record to `any` before using it.
- **Enforcement:** Type-checking, linting, and review.
- **Exceptions:** Library APIs named `any`, such as a test matcher's
  `expect.any`, are not the TypeScript `any` type.

## TS-002: Mark type-only imports

- **Requirement:** A symbol used only in type positions MUST use `import type`.
  Imports used to construct schemas or execute code MUST remain value imports.
- **Scope:** TypeScript modules compiled with `verbatimModuleSyntax`.
- **Reason:** The emitted module graph must match runtime use.
- **Compliant:** `import type { Vault } from "./vault.type";`
- **Noncompliant:** `import { Vault } from "./vault.type";` when `Vault` is only
  a type.
- **Enforcement:** Type-checking and linting.
- **Exceptions:** None.

## TS-003: Use explicit module exports

- **Requirement:** Modules MUST use named exports. Default exports MAY appear
  only where a framework or runtime entry point requires them.
- **Scope:** Production TypeScript and TSX modules.
- **Reason:** Named exports make ownership and refactoring visible.
- **Compliant:** `export class UnlockVault {}`.
- **Noncompliant:** `export default class UnlockVault {}` in a normal module.
- **Enforcement:** Linting and review.
- **Exceptions:** Framework and extension entry points that require a default.

## TS-004: Avoid mutation shortcuts and unsafe assertions

- **Requirement:** Code MUST NOT use the JavaScript `delete` operator. Type
  assertions MUST be limited to a reviewed boundary where runtime facts already
  establish the asserted type.
- **Scope:** Production TypeScript and TSX.
- **Reason:** Object reconstruction preserves immutable reasoning. Assertions
  must not replace validation.
- **Compliant:** Build a new object without the omitted field, or brand bytes
  immediately after verifying their exact length and purpose.
- **Noncompliant:** `delete record.secret` or `stored as Vault` before decoding.
- **Enforcement:** Search, linting, and boundary tests.
- **Exceptions:** Test-only malformed fixtures may use double assertions to
  construct states that valid production APIs cannot create.

## TS-005: Prefer direct named imports

- **Requirement:** Code SHOULD import the names it uses. Namespace imports MAY
  group a genuine function collection, but MUST NOT be used as an instance or
  singleton mechanism.
- **Scope:** TypeScript and TSX imports.
- **Reason:** Module namespace syntax does not control service construction or
  object identity.
- **Compliant:** `import { map, pipe } from "some-library";` and explicit
  composition of shared service instances.
- **Noncompliant:** `import * as Services from "./services"` with the claim that
  it guarantees one service instance.
- **Enforcement:** Review.
- **Exceptions:** None.
