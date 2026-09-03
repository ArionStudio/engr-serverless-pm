# Cryptography and secret-ownership standards

Exact algorithms, encodings, and protocol fields belong to the
[security specification](../security/security-specification.md). These rules
govern their implementation.

## CRYPTO-001: Implement the declared suite exactly

- **Requirement:** Cryptographic code MUST use the algorithms, sizes, encodings,
  canonicalization, and parameters declared by the active algorithm suite and
  security specification. It MUST reject unsupported suites before secret use.
- **Scope:** Core crypto contracts, codecs, and WebCrypto adapters.
- **Reason:** An approximate implementation is not interoperable or reviewable.
- **Compliant:** Import a suite-specific key only after exact encoding checks.
- **Noncompliant:** Accept a compatible-looking key from an unknown suite.
- **Enforcement:** Known-answer, malformed-key, and suite-dispatch tests.
- **Exceptions:** None.

## CRYPTO-002: Separate keys by purpose

- **Requirement:** Signing, key agreement, wrapping, local protection, recovery,
  and session encryption MUST use the key purpose defined by the specification.
  Code MUST NOT reuse one key pair for signing and wrapping.
- **Scope:** Key generation, storage, and use.
- **Reason:** Key reuse joins trust domains and can invalidate protocol
  assumptions.
- **Compliant:** Use distinct suite-declared signing and wrapping keys.
- **Noncompliant:** Use a signing private key for ECDH.
- **Enforcement:** Type branding, adapter tests, and trust-transition tests.
- **Exceptions:** None.

## CRYPTO-003: Bind cryptography to its context

- **Requirement:** Signatures, HKDF derivation, wrapping, and authenticated
  encryption MUST use canonical, purpose-bound context and AAD fields declared
  by the specification.
- **Scope:** Signed and encrypted artifacts.
- **Reason:** Context binding prevents valid material from being replayed for a
  different vault, device, generation, or operation.
- **Compliant:** Include the declared vault and session identity in canonical AAD.
- **Noncompliant:** Encrypt a session payload with empty AAD.
- **Enforcement:** Cross-context substitution and canonical-byte tests.
- **Exceptions:** None.

## SECRET-001: Make buffer ownership explicit

- **Requirement:** Every mutable secret buffer MUST have an identifiable owner,
  final use, wipe point, and behavior on every exit path. Code MUST NOT wipe
  caller-owned or shared buffers.
- **Scope:** Core workflows, sessions, fixtures, and crypto adapters.
- **Reason:** Both missed wipes and premature wipes break security or correctness.
- **Compliant:** A use case wipes its derived key in `finally` after persistence.
- **Noncompliant:** An adapter wipes the caller's active vault master key.
- **Enforcement:** Ownership inventory and cleanup tests.
- **Exceptions:** None.

## SECRET-002: Minimize and wipe owned copies

- **Requirement:** Code MUST minimize secret copies, use non-extractable
  ephemeral keys when the protocol permits, and best-effort wipe owned mutable
  copies on replacement, removal, failure, and completion.
- **Scope:** Secret-bearing runtime code.
- **Reason:** Each copy extends the time and places in which a secret exists.
- **Compliant:** Wipe decoded temporary key bytes after WebCrypto import.
- **Noncompliant:** Retain multiple decoded copies for convenience.
- **Enforcement:** Failure-path and identity-preservation tests.
- **Exceptions:** The active owner retains the one copy required for its defined
  lifetime.

## SECRET-003: State JavaScript erasure limits honestly

- **Requirement:** Documentation and errors MUST describe secret wiping as best
  effort. They MUST NOT claim guaranteed erasure of strings, WebCrypto internals,
  browser history, or memory lost during process termination.
- **Scope:** Security documentation and user-visible claims.
- **Reason:** JavaScript and browser runtimes do not expose reliable memory
  erasure for all representations.
- **Compliant:** Document which owned `ArrayBuffer` instances are overwritten.
- **Noncompliant:** Claim that locking removes every trace of a password from
  memory.
- **Enforcement:** Documentation and threat-model review.
- **Exceptions:** None.
