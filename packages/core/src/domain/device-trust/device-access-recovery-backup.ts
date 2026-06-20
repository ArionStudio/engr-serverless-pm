import type { RandomBytes } from "../crypto/brand-keys";
import type { SerializedWrapped } from "../crypto/protected-artifact";
import type { DevicePublicSignKey } from "./brand-keys";
import type { LocalKeysPayload } from "./local-protection.type";

/**
 * Encrypted local backup of one device's trust material.
 *
 * Recovery rotation replaces the current persisted backup only. A copied backup
 * or hostile local-storage rollback can still be decrypted with the recovery
 * words that protected that older backup.
 */
export type DeviceAccessRecoveryBackup = {
  readonly vaultId: string;
  readonly deviceId: string;
  readonly algorithmSuiteId: string;
  readonly recoveryLocalKeysProtectionSalt: RandomBytes;
  readonly devicePublicSignKey: DevicePublicSignKey;
  readonly protectedLocalKeys: SerializedWrapped<LocalKeysPayload>;
};
