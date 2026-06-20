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

/**
 * Pending device enrollment material persisted inside a signed vault snapshot.
 *
 * This intentionally has no expiry field. Core has no trusted time authority in
 * the local-first threat model, so a local clock check would not be a security
 * boundary. User interfaces may choose to hide stale enrollment invitations, but
 * persisted trust state must rely on signed key material and sync guards.
 */
export type EnrollmentKeySlot = {
  enrollmentId: string;
  pendingDeviceId: string;
  pendingDevicePublicSignKey: DevicePublicSignKey;
  pendingDevicePublicSignKeyDigest: string;
  protectedVaultMasterKeyDigest: string;
  protectedVaultMasterKey: SerializedWrapped<VaultMasterKey>;
  authorizedByDeviceId: string;
  authorizerSignature: SerializedSignatureOf<DeviceEnrollmentAuthorizationPayload>;
};
