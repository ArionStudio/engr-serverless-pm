import type { DevicePrivateSignKey } from "../../domain/device-trust/brand-keys";
import type { VaultMasterKey } from "../../domain/snapshot/brand-keys";
import type { UnlockedVaultSessionPayloadKey } from "../../domain/session/unlocked-vault-session-payload-key";

/**
 * Stores the active unlocked-vault session material.
 *
 * This record contains the hot secret material required to decrypt and operate
 * on the encrypted unlocked-vault session payload. Implementations should use
 * volatile, session-scoped storage and expose only the active record.
 */
export interface UnlockedVaultSessionMaterialRepositoryPort {
  saveUnlockedVaultSessionMaterial: (material: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly sourceSnapshotRevision: number;
    readonly deviceId: string;
    readonly vaultMasterKey: VaultMasterKey;
    readonly devicePrivateSignKey: DevicePrivateSignKey;
    readonly payloadKey: UnlockedVaultSessionPayloadKey;
  }) => Promise<void>;
  getUnlockedVaultSessionMaterial: () => Promise<{
    readonly sessionId: string;
    readonly vaultId: string;
    readonly sourceSnapshotRevision: number;
    readonly deviceId: string;
    readonly vaultMasterKey: VaultMasterKey;
    readonly devicePrivateSignKey: DevicePrivateSignKey;
    readonly payloadKey: UnlockedVaultSessionPayloadKey;
  } | null>;
  removeUnlockedVaultSessionMaterial: () => Promise<void>;
}
