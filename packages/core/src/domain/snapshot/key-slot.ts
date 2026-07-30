import type { RandomBytes } from "../crypto/brand-keys";
import type { SerializedEncrypted } from "../crypto/protected-artifact";
import type { DeviceVaultPublicKey } from "../device-trust";
import type { VaultMasterKey } from "./brand-keys";

export type DeviceVaultKeyEnvelope = {
  readonly recipientDeviceId: string;
  readonly vaultKeyGeneration: number;
  readonly ephemeralPublicKey: DeviceVaultPublicKey;
  readonly hkdfSalt: RandomBytes;
  readonly encryptedVaultMasterKey: SerializedEncrypted<VaultMasterKey>;
};

export type DeviceVaultKeyEnvelopeContext = {
  readonly vaultId: string;
  readonly deviceId: string;
  readonly vaultKeyGeneration: number;
  readonly algorithmSuiteId: string;
};

export type DeviceKeySlot = {
  readonly deviceId: string;
  readonly vaultKeyGeneration: number;
  readonly envelope: DeviceVaultKeyEnvelope;
};
