/**
 * Vault session and lock state types.
 *
 * The vault key and decrypted data only exist in memory during an unlocked session.
 * Auto-lock triggers memory wipe after inactivity.
 *
 * @see docs/security/security-specification.md Section 10
 */

import type { MasterKEK, VaultKey } from "../crypto/crypto.type";
import type { DeviceKeyPair } from "../device/device-key.type";

/**
 * Active unlocked vault session.
 * Contains sensitive keys that must be wiped on lock.
 */
export interface UnlockedVaultSession {
  /** non-extractable */
  readonly vaultKey: VaultKey;
  /** non-extractable */
  readonly masterKEK: MasterKEK;
  readonly deviceKeyPair: DeviceKeyPair;
  /** Unix ms */
  readonly unlockedAt: number;
  /** Unix ms */
  expiresAt: number;
  /** Unix ms */
  lastActivityAt: number;
}

export type VaultLockState =
  | { readonly state: "locked"; readonly vaultId: string }
  | { readonly state: "unlocked"; readonly session: UnlockedVaultSession };

export interface SessionOptions {
  /** 0 = disabled */
  readonly autoLockTimeoutMinutes: number;
  readonly lockOnIdle: boolean;
  readonly lockOnPopupClose: boolean;
}

export interface SessionActivity {
  readonly type: "view" | "edit" | "copy" | "search" | "sync";
  /** Unix ms */
  readonly timestamp: number;
}
