# Full application UI review

Scope: the application UI delivered after `af6a457` on `review/interactive-s3-setup`, including untracked implementations and affected composition/core boundaries. Reviewed on 2026-09-06. Changes remain uncommitted for user review.

## Repairs

| Failure                                                                                                                                                     | Correction and evidence                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synced enrollment and revocation sent credentials to a permission adapter that accepts only a storage location, so its strict decoder rejected the request. | Both callers now pass only bucket, region and prefix. Existing feature tests exercise the actual browser S3 permission adapter.                                                                       |
| Selecting a replacement enrollment file left the previous approval or fingerprint confirmation actionable during a delayed or failed read.                  | Clear previous artifacts before reading, disable submission while pending and retain lifecycle guards. Tests cover delayed rejection.                                                                 |
| Successful device and sync mutations appeared to fail when their subsequent status read failed.                                                             | Preserve the committed result, downloadable approval and required security follow-up; report status refresh failure separately. Tests and named gallery states cover this distinction.                |
| Devices missed same-session/focus changes and could drop updates during another action.                                                                     | Use a shared latest-request refresh owner for passive and post-action reads, with hard invalidation clearing transient secrets and artifacts. Boundary tests cover notification and cleanup behavior. |
| Revealed password/secret fields could reappear revealed after returning to enrollment or revocation.                                                        | Reset visibility when leaving or hiding those fields. Existing tests now check the return path.                                                                                                       |
| A device name saved in Settings did not appear in Devices.                                                                                                  | Project the existing device-local preference onto the current device only; leave shared trust profiles unchanged. Composition and Chrome checks cover the result.                                     |
| Successful retries retained obsolete refresh errors.                                                                                                        | Separate operation errors from refresh errors and clear only the latter after a successful refresh. Existing tests cover failure followed by recovery.                                                |

## Coverage

| Area                      | Reviewed behavior and evidence                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vault access and recovery | Setup, unlock/lock, numbered recovery-word paste, wrong recovery rejection, replacement words and three-word verification. Core/feature tests and unpacked Chrome exercise persistence and crypto.                                                                        |
| Entries and tools         | Read/search, add/edit/delete, stale revisions, deliberate reveal/copy, generator-to-entry transfer and pending upload. Existing behavior tests and Chrome cover the relevant boundaries.                                                                                  |
| Popup                     | Search, entry details, reveal/copy, add/edit/delete and password or username generation remain inside the popup. Options opens only for configuration, and unfinished entry drafts disable navigation that would discard them.                                            |
| Tags                      | Vault-owned tag creation, fixed groups, color/shade variants, rename and guarded removal use composed core operations. Case/Unicode duplicates, stale edits, orphan references and deletion of referenced tags are rejected; tag state participates in encrypted sync.    |
| Devices                   | Request, fingerprint comparison, approval transfer, enrollment, device identity and revocation. Two disposable Chrome profiles complete local enrollment and read an existing entry; synced UI actions additionally exercise the real strict permission adapter in tests. |
| Sync                      | Host access, read-only access test, conditional upload, credential repair, review/resolution, trust changes, shutdown/provider cleanup and failed follow-up reads. Core/composition tests and Chrome use controlled S3 responses.                                         |
| Settings                  | Local name and lock duration, password change, replacement recovery and confirmed local deletion. Chrome verifies the old password fails and deletion leaves remote storage unchanged.                                                                                    |
| Navigation and gallery    | Entries, Tags, Password tools, Devices, Sync and Settings use stable destinations. Actual feature implementations, behavior states and named visual axes are registered in the gallery.                                                                                   |

Core continues to own cryptography, trust, persistence and sync transitions. Composition exposes narrow capabilities; feature state holds transient drafts. Settings reuses the recovery flow, devices reuse the artifact transport and trust use cases, and tools reuse core generation. Gallery fixtures stay outside the production extension.

## Test selection

Removed one test that only forwarded a password into a mock and propagated its mocked rejection; core and browser checks already cover the actual security behavior. Added three focused tests for approval-file replacement, device subscription events and local-name projection. Other regressions extend existing tests. The extension suite increased from 607 to 609 tests overall. No contrast/pixel audits, CSS-class assertions or snapshot tests were added.

## Validation evidence

| Check                                                                                 | Result                                                                                                                   |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm ext:test --run`                                                                 | 62 files, 636 tests passed                                                                                               |
| `pnpm core:test --run`                                                                | 66 files, 842 tests passed                                                                                               |
| `pnpm ext:build`                                                                      | Passed; Vite still reports its existing large-chunk warning                                                              |
| `pnpm ext:lint`                                                                       | Passed without warnings                                                                                                  |
| `pnpm core:type-check`                                                                | Passed                                                                                                                   |
| `pnpm --filter @lfspm/extension run gallery:check`                                    | 321 components/parts and 82 variant axes                                                                                 |
| `git diff --check af6a457 --`                                                         | Passed                                                                                                                   |
| `node docs/ui-ux/verification/sync-options.verify.cjs` with installed Playwright      | Chrome 152; 16 signed requests, two controlled writes, no collected runtime errors/warnings                              |
| `node docs/ui-ux/verification/device-enrollment.verify.cjs` with installed Playwright | Two disposable unpacked Chrome profiles; enrollment and existing-entry read passed, no collected runtime errors/warnings |
| Gallery browser check                                                                 | Device and sync refresh-failure states in both themes, including a narrow sync layout; no browser errors                 |

Per-run logs and screenshots are kept in ignored `.local/full-ui-review/` rather than committed as generated artifacts.

## Review method and limits

Two independent subagents performed the first full review. Later passes used three existing reviewers because the platform rejected new reviewer threads at its thread limit. This is a documented deviation from the fresh-agent and adaptive-pool requirements of the review skill. Reviewers independently inspect the full original-base scope; the parent verifies findings and owns all fixes.

Final confirmation completed with no unresolved findings. Round 1 used two reviewers; rounds 2–3 used three; rounds 4–6 used two. Rounds 1–2 produced the behavior repairs above. Rounds 3–4 found outdated validation/inventory documentation, now corrected. Both reviewers reported no actionable findings in each of rounds 5 and 6 against the complete scope. Broad checks were not repeated after documentation-only corrections; diff and inventory checks remained green.

The final simplification pass made no code changes. Device refresh already has one owner for passive and post-action reads. Operation errors and refresh errors have different lifetimes; merging them would lose committed results or retain obsolete errors. Lifecycle and request counters guard different forms of stale completion. Small composition mappings do not justify introducing a new cross-feature abstraction during this repair. No redundant fix layer was identified that could be removed while preserving these behaviors.

The validated build was copied to `/home/arion/Downloads/lfspmextension` on Clarke. The application gallery is available at `http://100.77.254.40:4104/screens.html#application`; the user must reload the unpacked extension to use updated files.

No real AWS account was contacted. Controlled SDK responses do not prove a user's IAM policy, bucket configuration or live two-device S3 behavior. The browser enrollment check uses local enrollment; it does not claim synced enrollment against AWS. Firefox packaging and native printing were not validated, and mobile support was excluded at the user's request. This review is not a guarantee that the application has no vulnerabilities.

## S3 permission follow-up

After the review, the user reported a generic Enable sync error and requested earlier browser authorization. The setup guide now checks browser access alongside the location, before credential entry. Existing-storage setup follows the same sequence. The actual adapter validates locations, including dotted buckets and root prefixes; invalid locations are distinguished from denied browser permission. Location changes and permission revocation invalidate progress. Test and Enable retain their permission checks for later changes.

Known AWS read failures now produce separate messages for read permission, credentials/signature and bucket/region errors. Rejected uploads identify the upload failure. The definitive credential-rejection rules used to verify old-key revocation remain unchanged; a denied read or bad signature cannot confirm revocation.

The reported Enable sync response was a valid, newer LFSPM snapshot already in
the selected S3 namespace. Setup previously refused to overwrite it but left the
user at a dead end. The application now identifies this case, keeps credentials
only in the mounted form and requires **Use newer vault from S3** before changing
local state. Core repeats the complete review, accepts only a strictly newer
authenticated snapshot with unchanged trust and key material, persists it with
encrypted device-local credentials and performs no S3 write. Generic sync errors
also use operation-specific safe fallbacks and map the real session and malformed
remote-record errors without exposing provider data.

Two subagents investigated/reviewed this follow-up. A malformed-prefix counterexample was fixed and reconfirmed. Validation passed: extension build and lint; focused sync/adapter tests; six composition integration tests; gallery inventory; and the unpacked Chrome sync script with 17 signed requests, two controlled writes and no collected unexpected errors. The script explicitly grants browser access before credentials, rejects one setup read with AccessDenied, verifies no upload occurred, then retries successfully. Gallery checks cover required, denied and invalid access states in both themes, including a narrow layout. The user's live AWS account remains unverified.

The completed application pass was validated separately. The full core suite
passed 833 tests and the full extension suite passed 630 tests. Core and extension
type checks, extension lint and build, gallery build, inventory, and `git diff --check` passed. The
actual reconnect state and action were exercised in the gallery at desktop and
400 px widths in both themes: the warning remains readable, identifies the
newer S3 vault, and replaces the credential form with the connected state only
after explicit confirmation. The controlled unpacked-Chrome script could not be
rerun in this checkout because its optional Playwright dependency is unavailable;
no dependency was installed for that check.

The final popup and tag pass keeps tests at behavior and data boundaries. Existing
tests now cover local popup workflows and draft protection, tag form submission,
in-use deletion protection, stale tag versions, sync convergence and codec
rejection of missing tag references. The gallery maps 321 implementations and
parts across 82 named axes, including popup presentations and organization states.
