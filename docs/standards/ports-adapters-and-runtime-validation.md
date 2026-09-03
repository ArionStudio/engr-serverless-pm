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
