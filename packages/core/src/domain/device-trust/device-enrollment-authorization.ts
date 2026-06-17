import type { SerializedSignatureOf } from "../crypto/protected-artifact";

export type DeviceEnrollmentAuthorizationPayload = {
  readonly version: 1;
  readonly vaultId: string;
  readonly enrollmentId: string;
  readonly pendingDeviceId: string;
  readonly pendingDevicePublicSignKeyDigest: string;
  readonly expiresAt: number;
  readonly protectedVaultMasterKeyDigest: string;
};

export type CompletedDeviceEnrollmentProof =
  DeviceEnrollmentAuthorizationPayload & {
    readonly authorizedByDeviceId: string;
    readonly authorizerSignature: SerializedSignatureOf<DeviceEnrollmentAuthorizationPayload>;
  };
