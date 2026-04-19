/**
 * Session utility functions.
 *
 * @see docs/security/security-specification.md Section 10
 */

import type { UnlockedVaultSession, VaultLockState } from "./session.type";

/**
 * Type guard to check if vault is unlocked.
 */
export function isVaultUnlocked(
  state: VaultLockState,
): state is { state: "unlocked"; session: UnlockedVaultSession } {
  return state.state === "unlocked";
}

/**
 * Type guard to check if vault is locked.
 */
export function isVaultLocked(
  state: VaultLockState,
): state is { state: "locked"; vaultId: string } {
  return state.state === "locked";
}
