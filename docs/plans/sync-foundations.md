# Sync foundations implementation plan

## Outcome and scope

Make the existing sync and entry workflows safe to connect to the vault UI.
This pass covers convergence, stale editor commands, device-local credential
repair, production composition, and regression coverage. Vault and sync screens
follow these contracts. The existing online-write policy stays in place.

Start from merged PR #97, commit `094567a`. No dependency, cryptographic suite,
persisted schema, offline-merge engine, or provider-side credential management
is required. No live AWS writes are part of validation.

## Evidence and recovered decisions

The September 5 review reproduced repeated reviews after accepting remote data
and stale-form overwrites. It also identified missing routine credential repair.
The user then requested a PR for the existing UI work, leaving these findings
for follow-up. Source: T3 thread `b347c5f7-5efd-4190-911c-efee1d697ac8`,
2026-09-05 23:40–23:55 UTC.

Current code still increments resolved item and vault vectors when every choice
accepts the remote version. Update/delete commands do not carry the version
originally read by the editor. SetupSync rejects an already configured vault;
credential replacement in device-revocation workflows has a different purpose.

## Implementation order

### 1. Accept remote state without creating another change

- Keep all current session, local identity, remote digest, trust, key-slot,
  configuration, profile, and resolution validation.
- Reuse the pure resolution operation to validate every supplied choice before
  deciding persistence. Duplicate, missing, extra and unsupported choices must
  still reject before writes.
- When all reviewed choices accept remote state, reuse
  `persistVerifiedRemoteSnapshot` to adopt the exact authenticated snapshot and
  its vectors. Do not encrypt, sign or upload another content revision.
- Preserve the current locally authored resolution path for local/mixed choices,
  including conditional upload, rollback and uncertain-outcome handling.
- Cover additions, edits, tombstones, tags, profiles, pending upload cleanup,
  stale reviews and repeated alternating device checks.

### 2. Bind edits and deletions to the version the user read

- Return a detached entry version vector alongside ReadEntry's visible fields.
  Passwords remain available only through the existing secret-read/copy workflows.
- Require `expectedEntryVersionVector` on UpdateEntry and RemoveEntry. Capture
  and validate it before asynchronous work and compare against the authenticated
  current entry before provider or persistence effects.
- Reuse the existing version-vector model and comparison policy. A changed entry
  raises a dedicated error; unrelated entry changes do not invalidate the form.
- Keep snapshot CAS for races occurring after that initial entry comparison.
- Update all callers and tests in place. Test stale password/metadata changes,
  stale deletion, malformed input, caller mutation, and current-version success.

### 3. Repair this device's credentials

- Add a caller-visible UpdateSyncCredentials use case, composed into the existing
  extension application graph. Reuse provider setup normalization and the existing
  read-only access probe. Probe success establishes read access, not write access.
- Require an unlocked matching vault and configured target. Normalize the new
  input and reject any provider or target change.
- Authenticate existing local credential state and preserve its pending upload
  intent and previous-credential revocation evidence. Reject reusing a credential
  awaiting revocation. Missing or corrupt credential records remain explicit
  errors in this routine replacement flow; it must not guess lost state.
- Encrypt with the existing device/vault/provider/target context. Compare the
  exact old credential artifact, authenticated snapshot and checkpoint in the
  existing atomic repository operation. Keep the snapshot and checkpoint intact.
- Revalidate the originating session for key use and persistence. Network work
  must not hold the session lease or postpone locking. No remote write, trust
  mutation, version increment, or pending-intent clearing belongs here.
- Cover access rejection, network failure, target mismatch, tampered state,
  concurrent credential/snapshot replacement, lock, pending-state preservation,
  and encryption/save failures. Exercise production IndexedDB/WebCrypto wiring.

### 4. Validate the combined behavior

Use canonical stateful fixtures and production adapters where available. Verify
that alternating devices converge after accepting remote changes, stale forms
cannot restore older values, and credential repair preserves uncertain-upload
reconciliation. Include deletion and response-loss coverage through existing
provider-outcome contracts. Do not claim a live two-device S3 test from mocks.

Run focused tests after each unit, then full core and extension tests, both type
checks, extension lint/build, formatting and diff checks. Update current workflow
and sync documentation together with the implementation.

## Plan review against repository standards

| Requirement                   | Design decision / acceptance evidence                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| CORE-ARCH-001/007/008/010/014 | Core owns policy; reuse services and ports; no use-case nesting; one existing composition graph.                                             |
| TRUST-001–004, STATE-001–004  | Preserve authentication before effects and atomic exact-artifact CAS. Direct remote adoption still creates the appropriate local checkpoint. |
| SYNC-001–005                  | Keep strict online writes, explicit remote review, exact upload identity and durable uncertain-upload intent.                                |
| API-003/005                   | Reuse named version-vector contracts; correct unreleased commands and callers together without compatibility aliases.                        |
| CRYPTO-004, SECRET-001–003    | Preserve artifact shapes and context binding; no new secret store or erasure guarantees.                                                     |
| TEST-001–007                  | Add concrete counterexamples and forbidden-effect assertions, then validate production adapter boundaries and affected packages.             |

Reviewed risks before implementation: an all-remote shortcut must not bypass
resolution validation; receipt cleanup must remain atomic with remote adoption;
editor version checks supplement snapshot CAS; credential repair must not clear
pending uploads, resurrect previous credentials or hold the lock during network
I/O. Existing review-skill references contain older credential-storage and suite
descriptions; current `docs/standards`, artifact contracts and live code govern.

## UI/UX constraints carried forward

Recovered from the same thread on September 5, including 15:31 and 18:06 UTC,
and checked against [React/UI standards](../standards/react-and-ui.md):

- Use the exact Mira/mauve/violet/Figtree/Hugeicons preset and Base UI components.
- Build with existing feature slices and narrow composed capabilities. Keep core
  sync and persistence policy out of React.
- No subtitles, slogans, decorative footer copy, or implementation-status labels.
  Field guidance states purpose/requirements; explanations support safety or a
  meaningful decision. Password strength stays hidden for an empty field.
- Every rendered component, named variant, layout and behavior state must remain
  reviewable in the gallery using the actual implementation and isolated data.
- Preserve accessible labels, keyboard focus, contrast in both themes, narrow
  layouts and the explicit Chrome typography override.
- Show local save and remote upload outcomes accurately. Pending upload is not a
  failed local save. A stale editor requires review of the newer entry.
- Credential repair, sync disabled, offline and integrity failures are distinct
  states. DisableSync currently deletes remote state and changes device trust;
  it needs a destructive flow and must not be presented as a pause toggle.

Mobbin MCP was queried and images inspected on 2026-09-06. The
[Klaviyo integration screen](https://mobbin.com/screens/53552905-983e-4059-8fd4-c2ecb4aeb062)
places an expired-credential warning in settings but mixes it with a disabled
integration state. The
[Customer.io destination screen](https://mobbin.com/screens/0798eb2e-54fd-434b-b023-c374add64362)
combines enablement and account sign-in. Neither is adopted as a direct reference
for this security-sensitive flow. Keep the previously reviewed
[Mobbin board](../ui-ux/mobbin.md) for the later vault UI; choose new references
against the proven states when screen implementation starts.

## Execution record

Completed on `feature/core/sync-foundations`, based on merged PR #97.

- Remote adoption: verified the original counterexample failed before the fix.
  All-remote choices now preserve exact snapshot bytes and versions. Coverage
  includes tombstones, tags, profiles, invalid/duplicate/incomplete choices and
  atomic pending-upload cleanup. Local/mixed choices retain upload and rollback
  coverage.
- Entry commands: ReadEntry returns a detached vector; update/delete require it.
  Tests cover newer password/metadata changes, unrelated changes, malformed
  vectors, and caller mutation of the target or expected version.
- Credential repair: added the use case to the existing application composition.
  Tests cover target mismatch, authentication/network/crypto/save failure,
  malformed outcomes, missing state, concurrent snapshot/credential replacement,
  previous-credential reuse and preservation of pending records.
- Production composition: two independently enrolled devices use real WebCrypto,
  IndexedDB and session composition against a simulated conditional provider.
  Three alternating checks remain equal after remote adoption. Stale updates and
  deletions reject. A deletion with a lost upload response survives credential
  replacement and reconciles without a second upload. The other device accepts
  the tombstone. Lock completes while a repair probe is pending; completing that
  probe cannot save credentials under the invalidated session. Unlock and sync
  remain usable afterward.

Final review checked the implementation against this plan and the normative
standards. It also caught a caller-mutable target in the entry commands; target
IDs are now captured with the expected vector, and the regression checks both.
No blocking finding remains in this scoped review. No new service, repository
port, schema version, dependency or UI component was needed.

Validation on September 6, 2026:

| Check                                              | Result                                    |
| -------------------------------------------------- | ----------------------------------------- |
| `pnpm core:test --run`                             | 57 files, 806 tests passed                |
| `pnpm ext:test --run`                              | 41 files, 518 tests passed                |
| `pnpm core:type-check`                             | Passed                                    |
| `pnpm --filter @lfspm/extension run type-check`    | Passed                                    |
| `pnpm ext:lint`                                    | Passed                                    |
| `pnpm ext:build`                                   | Passed; Vite reports a chunk above 500 kB |
| Changed-file Prettier check and `git diff --check` | Passed                                    |

No live AWS request or unpacked-Chrome run was performed for this core and
composition change. The production-composition test uses simulated provider and
browser APIs; it is not a live S3 or browser acceptance claim. No rendered UI or
packaging configuration changed, so gallery and visual approval remain with the
next vault-screen implementation. Generated build output and per-run logs are
excluded from the change.
