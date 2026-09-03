# Error, logging, and sensitive-data standards

## ERROR-001: Keep errors secret-safe

- **Requirement:** Errors MUST NOT contain submitted passwords, plaintext vault
  data, provider credentials, recovery material, raw keys, or hostile serialized
  records. They MAY retain non-secret identifiers needed to diagnose ownership
  and conflicts.
- **Scope:** Core and extension errors.
- **Reason:** Error objects cross logs, test output, and process boundaries.
- **Compliant:** Report a static artifact-invalid error with a vault ID.
- **Noncompliant:** Include the rejected JSON or password in the message.
- **Enforcement:** Full error-graph inspection tests.
- **Exceptions:** None.

## ERROR-002: Replace unsafe causes at the input owner

- **Requirement:** The code that first owns sensitive input MUST sanitize native
  parser and platform errors before wrapping or propagating them. Sanitized
  errors MUST NOT retain the original cause, stack, symbols, or nested object.
- **Scope:** Parsing and validation of sensitive input.
- **Reason:** Wrapping an unsafe error does not remove the data it already
  captured.
- **Compliant:** Replace a URL parser failure with a static cause-free project
  error.
- **Noncompliant:** `throw new InvalidEntryError("invalid", { cause })` when the
  cause contains the submitted URL.
- **Enforcement:** Recursive and cycle-safe error-graph tests.
- **Exceptions:** A proven secret-free project error may be rethrown unchanged.

## ERROR-003: Minimize URL disclosure

- **Requirement:** Malformed entry URLs MUST produce static errors. A parsed but
  unsupported URL MAY expose only its protocol. Valid HTTP and HTTPS display
  values MUST strip credentials, query strings, and fragments.
- **Scope:** Password-entry URL validation and display.
- **Reason:** URLs commonly contain credentials and tokens.
- **Compliant:** Report `Unsupported protocol: ftp:`.
- **Noncompliant:** Include `https://user:pass@example.test/?token=...`.
- **Enforcement:** URL redaction and error-graph tests.
- **Exceptions:** None.

## ERROR-004: Distinguish incomplete security state

- **Requirement:** Code MUST distinguish absence, unreadable state, stale
  ownership, conditional conflict, and incomplete rollback when those outcomes
  require different safe actions.
- **Scope:** Security-sensitive repositories and workflows.
- **Reason:** Collapsing these outcomes to `null` or one generic error can delete
  newer state or hide required reconciliation.
- **Compliant:** Return a dedicated rollback-incomplete error after a declined
  conditional restore.
- **Noncompliant:** Treat an unreadable session as no active session.
- **Enforcement:** Outcome-specific failure tests.
- **Exceptions:** None.

## LOG-001: Restrict production console output

- **Requirement:** Core MUST NOT write to the console. Extension runtime and UI
  recovery boundaries MAY use `console.warn` or `console.error` with static,
  non-sensitive messages. Production code MUST NOT use `console.log`,
  `console.debug`, or `console.info`.
- **Scope:** Production TypeScript and TSX.
- **Reason:** Console arguments can persist sensitive runtime data outside the
  application's controls.
- **Compliant:** `console.error("Scheduled task alarm handling failed.")` at the
  outer background listener.
- **Noncompliant:** `console.error("Unlock failed", error, command)`.
- **Enforcement:** Linting, search, and review.
- **Exceptions:** None.
