# Work Packet: Remove Secret-Bearing URL Parse Errors

Finding: 25.

Resolution unit: **work item 25** (Finding 25 only).

Status: open, narrow, and independently implementable.

## Verified current behavior

[`sanitizeEntryUrl`](../../../packages/core/src/domain/entry/sanitized-entry-url.utils.ts#L5)
calls `new URL(rawUrl)` directly. Native parse failures can retain the raw input.
Add and update catch that error and store it as
[`InvalidPasswordEntryError.cause`](../../../packages/core/src/errors/vault-entry.errors.ts#L12).
A malformed URL containing `user:password@...` or a secret query can therefore
survive in logs or error inspection.

## Required invariant

No error message, property, stack-associated cause, or nested cause returned by
entry validation may retain the raw URL. Unsupported-protocol errors may expose
only the parsed protocol, never credentials, query, or fragment.

## Recommended implementation

1. Make `sanitizeEntryUrl` translate native parse failure into a project error
   with a static message and no native cause/raw input.
2. Preserve `UnsupportedEntryUrlProtocolError` for successfully parsed but
   unsupported protocols.
3. Let add/update wrap only the sanitized project error, or adjust the error
   boundary so there is one stable public `InvalidPasswordEntryError`.
4. Do not include the submitted URL in assertion messages or test names.

The domain sanitizer is the single owner; do not duplicate `try/catch` redaction
logic in every entry use case.

## Required regression tests

- Malformed input containing credentials and a secret query is rejected.
- Recursively inspect the public error, own properties, message, stack, and
  nested causes; the credential and query secret must not occur.
- Add and update both preserve the established public error class.
- Unsupported `ftp:` still reports only `ftp:`.
- Valid HTTP(S) sanitization still removes credentials, query, and fragment.

## Independence

This is a standalone core fix with no adapter or architecture dependency.

## Non-goals

- Do not change the allowed protocol list.
- Do not preserve native parse details for debugging.
- Do not add logging of rejected inputs.

## Completion evidence

Run sanitizer, add-entry, and update-entry tests, then `pnpm core:type-check` and
the full core suite.
