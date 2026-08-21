# Work Packet: Bind Device Access Material to the Active Identity

Finding: 22.

Resolution unit: **work item 22** (Finding 22 only).

Status: partially resolved and suitable for one focused core branch.

## Verified current behavior

Unlock now verifies the stored public keys against unwrapped private keys and
the verified trust chain. Recovery performs analogous vault, key-pair, trust,
and snapshot checks.

Two gaps remain:

- [`UnlockVaultUseCase`](../../../packages/core/src/use-cases/vault-lifecycle/unlock-vault.ts#L88)
  does not directly require `deviceAccessMaterial.vaultId === params.vaultId`
  before using the record.
- [`ChangeMasterPasswordUseCase`](../../../packages/core/src/use-cases/vault-lifecycle/change-master-password.ts#L33)
  checks the active vault and algorithm suite, but does not bind the returned
  access material's vault/device/public keys to the active session before
  rewrapping and overwriting it.

A hostile or misindexed repository can therefore supply another record. Unlock
usually rejects later through trust checks, but change-password can overwrite
the wrong record after a successful unwrap.

## Required invariant

Before key derivation that can lead to a write, all identities must agree:

- command vault ID;
- active session vault and device IDs;
- device access material vault and device IDs;
- access-material public signing/wrapping keys;
- active session private keys and verified trusted device identity.

## Implementation instructions

1. Add explicit vault-ID checks immediately after repository reads.
2. In password change, require material `deviceId` to equal the active device.
3. Verify both public/private key pairs against the active session keys before
   deriving new salts or writing.
4. Where available, bind the identity to the session's verified trust context;
   do not re-read an attacker-controlled snapshot merely to repeat trust work.
5. Add a specific static mismatch error or reuse the established persisted-vault
   mismatch family when semantics match.
6. Preserve the existing unsupported-suite and wrong-current-password errors.

## Required regression tests

- Wrong material vault ID rejects before key derivation and write.
- Wrong material device ID rejects before key derivation and write.
- Mismatched signing public/private pair rejects.
- Mismatched vault-wrapping public/private pair rejects.
- A material identity absent from the active trusted context rejects.
- The correct material still re-protects and saves exactly once.
- No error or cause contains raw key material or passwords.

## Independence and conflicts

This can be implemented standalone, but do not run it in parallel with Findings
11 or 12 because they edit the same lifecycle commands and fixtures. It does not
depend on a new trust architecture; reuse the current verified session context.

## Non-goals

- Do not re-verify the entire snapshot when the active session already owns a
  verified trust context.
- Do not add a second identity record.
- Do not change recovery-word semantics.

## Completion evidence

Run unlock, change-password, and recovery tests, `pnpm core:type-check`, and the
full core suite. Inspect that all mismatch tests assert no persistence call.
