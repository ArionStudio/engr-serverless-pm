import type {
  DeviceEnrollmentAuthorizationPayload,
  DevicePublicSignKey,
} from "../device-trust";
import type {
  SerializedSignatureOf,
  SerializedWrapped,
} from "../crypto/protected-artifact";
import type { VaultMasterKey } from "./brand-keys";

export type DeviceKeySlot = {
  deviceId: string;
  protectedVaultMasterKey: SerializedWrapped<VaultMasterKey>;
  publicSignKey: DevicePublicSignKey;
};

export type RecoveryKeySlot = {
  protectedVaultMasterKey: SerializedWrapped<VaultMasterKey>;
};

export type EnrollmentKeySlot = {
  enrollmentId: string;
  pendingDeviceId: string;
  pendingDevicePublicSignKey: DevicePublicSignKey;
  pendingDevicePublicSignKeyDigest: string;
  expiresAt: number;
  protectedVaultMasterKeyDigest: string;
  protectedVaultMasterKey: SerializedWrapped<VaultMasterKey>;
  authorizedByDeviceId: string;
  authorizerSignature: SerializedSignatureOf<DeviceEnrollmentAuthorizationPayload>;
};
