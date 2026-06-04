import type { Brand } from "../common/brand-keys";
import type { SerializedEncrypted } from "../crypto/protected-artifact";
import type { DevicePrivateSignKey } from "../device/brand-keys";
import type { VaultMasterKey } from "../snapshot/brand-keys";
import type { UnlockedVault } from "./unlocked-vault";
import type { Vault } from "./vault";

export type UnlockedVaultSession = {
  readonly unlockedVault: UnlockedVault;
  readonly sourceSnapshotRevision: number;
};

export type UnlockedVaultSessionPayloadKey = Brand<
  ArrayBuffer,
  "UnlockedVaultSessionPayloadKey"
>;

export type UnlockedVaultSessionPayloadEncryptionContext = {
  readonly sessionId: string;
  readonly vaultId: string;
  readonly sourceSnapshotRevision: number;
};

export type UnlockedVaultSessionMaterial =
  UnlockedVaultSessionPayloadEncryptionContext & {
    readonly deviceId: string;
    readonly vaultMasterKey: VaultMasterKey;
    readonly devicePrivateSignKey: DevicePrivateSignKey;
    readonly payloadKey: UnlockedVaultSessionPayloadKey;
  };

export type UnlockedVaultSessionPayload = {
  readonly vault: Vault;
};

export type EncryptedUnlockedVaultSessionPayload =
  UnlockedVaultSessionPayloadEncryptionContext & {
    readonly content: SerializedEncrypted<UnlockedVaultSessionPayload>;
  };

export type ProtectedUnlockedVaultSession = {
  readonly material: UnlockedVaultSessionMaterial;
  readonly encryptedPayload: EncryptedUnlockedVaultSessionPayload;
};
