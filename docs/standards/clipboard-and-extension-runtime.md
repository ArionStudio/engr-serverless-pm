# Clipboard and extension-runtime standards

## CLIPBOARD-001: Coordinate the complete copy lifecycle

- **Requirement:** Copy, scheduled clear, lock, local deletion, and enrollment
  rollback MUST use the same cross-context clipboard-operation boundary when
  they can affect clipboard ownership.
- **Scope:** Core clipboard workflows and extension adapters.
- **Reason:** Coordinating only the final write leaves ownership races around
  metadata and session cleanup.
- **Compliant:** Hold the origin-wide Web Lock across ownership checks and write.
- **Noncompliant:** Lock only `navigator.clipboard.writeText`.
- **Enforcement:** Controlled cross-context interleaving tests.
- **Exceptions:** Read-only clipboard capability checks.

## CLIPBOARD-002: Store only non-secret volatile ownership metadata

- **Requirement:** Clipboard ownership metadata MUST contain only the action ID,
  password hash, and expiry required by the protocol. It MUST use volatile
  session storage and MUST NOT contain plaintext or a reusable verifier.
- **Scope:** Clipboard clear-task persistence.
- **Reason:** Ownership metadata must not become another durable password store.
- **Compliant:** Store the declared one-way ownership hash in
  `chrome.storage.session`.
- **Noncompliant:** Store the copied password in local storage for comparison.
- **Enforcement:** Codec, storage, and secret-inspection tests.
- **Exceptions:** None.

## CLIPBOARD-003: Clear only proven ownership

- **Requirement:** A clear action MUST verify its action ID and current clipboard
  hash before writing. If volatile proof was lost after restart, it MUST preserve
  the clipboard instead of guessing.
- **Scope:** Clipboard clear workflow.
- **Reason:** Blind clearing can overwrite unrelated content copied later by the
  user.
- **Compliant:** Treat a missing ownership record as no authorized clear.
- **Noncompliant:** Clear the clipboard after restart because an old alarm still
  exists.
- **Enforcement:** Stale-action and cold-restart tests.
- **Exceptions:** An explicit user-triggered clear action designed to clear
  arbitrary clipboard content.

## RUNTIME-001: Use supported Chrome context messaging

- **Requirement:** Background and offscreen contexts MUST communicate through
  supported `chrome.runtime` messaging with request targeting, response
  validation, and timeout handling. One-shot `sendMessage` exchanges MAY use
  the returned promise and `sendResponse` channel for response correlation.
  Protocols that install separate response listeners MUST use explicit request
  IDs and remove those listeners on completion or timeout.
- **Scope:** Extension cross-context communication.
- **Reason:** A service-worker client transport can pass unit tests but fail in an
  installed extension.
- **Compliant:** Await the response promise for a targeted one-shot request, or
  correlate and clean up a separately registered response listener.
- **Noncompliant:** Treat the offscreen document as a service-worker client.
- **Enforcement:** Messaging tests and unpacked-extension smoke tests.
- **Exceptions:** None.

## RUNTIME-002: Enforce deadlines at the receiver

- **Requirement:** A request with side effects MUST carry an absolute deadline.
  The receiving context MUST reject expired work before the side effect.
- **Scope:** Cross-context extension requests.
- **Reason:** Sender timeout does not cancel a message already queued elsewhere.
- **Compliant:** Check `deadlineEpochMs` before clipboard access.
- **Noncompliant:** Time out only the sender promise while allowing a late write.
- **Enforcement:** Delayed-delivery tests.
- **Exceptions:** Idempotent read-only requests.

## RUNTIME-003: Implement exact clipboard writes

- **Requirement:** The Chromium adapter MUST use a mechanism that writes the
  requested clipboard text exactly, including an empty string.
- **Scope:** Offscreen clipboard adapter.
- **Reason:** Selecting an empty textarea does not reliably populate copy-event
  data.
- **Compliant:** Set explicit copy-event data and prevent the default operation.
- **Noncompliant:** Rely only on selecting an empty textarea before `execCommand`.
- **Enforcement:** Adapter unit tests and installed-extension smoke tests.
- **Exceptions:** None.

## RUNTIME-004: Build real composition roots

- **Requirement:** Every runtime entry point MUST construct the actual adapters,
  identity-sensitive dependencies, services, and use cases it executes. A
  compile-only fixture MUST NOT be treated as production composition.
- **Scope:** Background, offscreen, popup, and options entry points.
- **Reason:** Type compatibility does not prove that runtime listeners use the
  intended dependency graph.
- **Compliant:** The background alarm entry point composes its handler and
  adapters.
- **Noncompliant:** Claim a workflow is integrated because a type-check fixture
  can instantiate it.
- **Enforcement:** Runtime composition tests and extension smoke tests.
- **Exceptions:** Entry points that currently expose no application workflow.
