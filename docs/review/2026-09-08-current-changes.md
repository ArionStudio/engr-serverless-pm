# Current changes audit — 8 September 2026

This is the pre-extraction audit record. Its test counts and runtime results refer to that original audited tree, not to later reviewed commits. Each batch receives its own checks and PR review; the final icon integration records fresh evidence in [Website icon safety review](../ui-ux/favicon-review.md).

Scope: `origin/main` at `094567a596491139cff7fad8c2e93dc7002043a7` through the complete working implementation, including the 15 existing commits and uncommitted/new files. Three reviewers split sync/trust, organization/entries, and browser integration; the parent reviewed application navigation, validation results, and batch boundaries.

## Findings fixed

- **Folder identity:** root-level folders and children of a folder whose ID is `root` shared a uniqueness key. Parent-keyed sets now distinguish them.
- **Snapshot decoding:** the vault codec accepted normalized duplicate tag names, group names and sibling folder names. It now enforces the same name invariants as core before returning decoded state.
- **Creation controls:** organization fields and navigation remained usable while vault creation was pending. Controls now disable for the operation, and pending/error examples are available in the gallery.
- **Setup navigation:** the enabled Device step did not navigate back from Organization. Its handler now supports that transition and preserves the draft.
- **Capture buffers:** the captured-login adapter retained its owned encoded and decrypted plaintext buffers. Both are wiped in `finally` paths, including failures; the caller's session key is preserved.
- **Permission revocation:** an already-injected field monitor continued monitoring after website access was revoked. Revocation now also disables the detection preference, stopping the installed monitor.
- **Gallery registration:** a SearchField re-export produced duplicate gallery keys. Consumers now import the implementation directly and the public barrel exports it once.

- **Gallery theme:** the gallery and its provider competed to set the document theme, allowing the selector and rendering to disagree. Both galleries now use the existing theme provider as their single source.

Three existing core assertions were updated for the password-free `hasPassword` projection. The table search test now dismisses the suggestion menu before navigating pages. Runtime verifiers were updated for Organization setup and mandatory S3 enrollment; offline enrollment was not restored.

## Validation

- Complete core suite: **857 tests passed**; core type check passed.
- Complete extension suite: **732 tests passed**. The broad run used two workers and a 15-second per-test budget because parallel audit jobs caused different interaction tests to exceed the default five seconds. Assertion checks were unchanged. The later import-only gallery correction passed its affected gallery and popup suites.
- Chromium and Firefox production builds passed. The existing Vite large-chunk advisory remains.
- Extension lint passed. The component/variant inventory was regenerated for each extracted UI boundary.
- Isolated Chromium login smoke checks passed: encrypted capture, review/save, weak-password acknowledgement, explicit fill without submission, updates, email links, lock/unlock, duplicate suppression and detection off.
- Controlled field fixtures passed the existing identifier/password, SPA navigation, toolbar opening, registration and newsletter assertions. This does not establish current compatibility with the live XRBazaar site.
- Isolated Chromium S3 UI check: **17 signed intercepted requests, 2 writes**, no collected runtime/console/CDP warnings.
- Two-profile S3 enrollment check: **9 signed intercepted requests, 3 conditional writes**, including request, approval, verified location, connection, recovery verification and reading an existing entry. No collected runtime/console/CDP warnings.
- All four historical batch endpoints passed their core type check, production extension build and full core suite. The later extracted boundaries were also checked with their own local core dependencies; details are in the batch manifest.

Tests added during this audit cover the identified data and interaction failures. No contrast/pixel audits, CSS-class assertions or filename checks were added. The required component inventory remains.

## Limits

No live AWS account was used. Intercepted responses exercise signing and client behavior but do not verify a user's AWS authorization or actual service semantics. The headless S3 checks pregranted the exact host permission. Interactive permission dialogs, aged favicon caches and the real Firefox/Zen runtime remain unverified; Firefox packaging was built. The audit found no remaining confirmed defect in the reviewed scope, but is not a proof that the application has no vulnerabilities.

Raw logs, screenshots, temporary validation data and extraction scripts remain in ignored `.local/full-audit/` and the individual runtime artifact directories. The batch guide describes the preserved refs and sequential review process.
