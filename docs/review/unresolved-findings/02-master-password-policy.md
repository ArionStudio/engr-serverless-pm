# Work Packet: Enforce the New Master-Password Policy

Finding: 12.

Resolution unit: **work item 12** (Finding 12 only).

Status: open and independently implementable, provided it is not developed in
parallel with other branches editing the same lifecycle use cases.

## Verified current behavior

The security specification requires at least 12 characters in
[`security-specification.md`](../../security/security-specification.md#L75), but
[`RawMasterPassword`](../../../packages/core/src/domain/master-password/master-password.type.ts#L3)
is only a compile-time brand. Initialization, enrollment, password change, and
recovery pass a new password directly to crypto derivation. Runtime JavaScript
callers or casts can therefore establish an empty or weak password.

## Required contract

- Enforce the documented minimum of 12 characters whenever a new protection
  password is created.
- Apply it to initialize vault, perform device enrollment, change master
  password's `newMasterPassword`, and recover device access's
  `newMasterPassword`.
- Do not apply the new minimum to unlock or to password change's
  `currentMasterPassword`; existing weak vaults must remain recoverable and
  upgradeable.
- Validate before IDs, randomness, key derivation, repository reads, session
  reads, or writes.

## Reuse map

There is no current runtime owner for this policy. Create one small domain
validator/schema beside `master-password.ts`, with one project error for invalid
new passwords. All four new-password workflows must call that owner rather than
repeat a length check.

Do not put password policy inside `CryptoPort`: crypto derives keys from bytes;
product policy belongs at the use-case/domain boundary.

## Implementation instructions

1. Add a named minimum constant and a strict runtime schema or assertion.
2. Preserve the branded `RawMasterPassword` type for compile-time intent.
3. Add one error that has a static message and does not store the password.
4. Validate at the start of each new-password workflow.
5. Keep unlock/current-password compatibility unchanged.
6. Export only the policy symbols callers actually need.

## Required regression tests

- Length 11 is rejected and length 12 is accepted in all four new-password
  workflows.
- Rejection happens before every secret-bearing or persistent dependency.
- Unlock still attempts an existing password shorter than 12 characters.
- Change-master-password still verifies a short current password but rejects a
  short new password.
- The error, its fields, and its cause do not contain the submitted password.

## Independence and conflicts

This is a standalone behavior change. It should be a separate branch and PR.
Do not develop it concurrently with Findings 11 or 22 because they edit the same
use cases and fixtures. It has no dependency on sync, trust-chain, or adapter
work.

## Non-goals

- Do not add complexity scoring, breach checks, or passphrase generation.
- Do not silently change PBKDF2 parameters.
- Do not reject legacy passwords during unlock.

## Completion evidence

Run focused tests for initialize, enrollment, change password, recovery, and
unlock; then run `pnpm core:type-check` and the full core suite.
