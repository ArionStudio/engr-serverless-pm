import type { RandomBytes } from "../crypto/brand-keys";
import type {
  ProtectionKeyFor,
  SerializedSignatureOf,
  SerializedWrapped,
} from "../crypto/protected-artifact";
import type { VaultSnapshot } from "../snapshot";
import type {
  DeviceLocalProtectionKey,
  DevicePrivateSignKey,
  DevicePublicSignKey,
  DeviceVaultPrivateKey,
  DeviceVaultPublicKey,
} from "./brand-keys";
import type { LocalVaultTrustAnchor } from "./vault-trust";

export type DeviceEnrollmentRequestPayload = {
  readonly version: 1;
  readonly requestId: string;
  readonly vaultId: string;
  readonly expectedGenesisCertificateDigest: string;
  readonly deviceId: string;
  readonly algorithmSuiteId: string;
  readonly publicSignKey: DevicePublicSignKey;
  readonly publicVaultKey: DeviceVaultPublicKey;
};

export type DeviceEnrollmentRequest = {
  readonly payload: DeviceEnrollmentRequestPayload;
  readonly signature: SerializedSignatureOf<DeviceEnrollmentRequestPayload>;
};

export type DeviceEnrollmentPrivateState = {
  readonly request: DeviceEnrollmentRequest;
  readonly devicePrivateSignKey: DevicePrivateSignKey;
  readonly devicePrivateVaultKey: DeviceVaultPrivateKey;
  readonly deviceLocalProtectionKey: DeviceLocalProtectionKey;
};

export type DeviceEnrollmentPrivateStateProtectionKey =
  ProtectionKeyFor<DeviceEnrollmentPrivateState>;

export type PendingDeviceEnrollment = {
  readonly requestId: string;
  readonly vaultId: string;
  readonly deviceId: string;
  readonly algorithmSuiteId: string;
  readonly masterPasswordSalt: RandomBytes;
  readonly localKeysProtectionSalt: RandomBytes;
  readonly protectedPrivateState: SerializedWrapped<DeviceEnrollmentPrivateState>;
};

export type DeviceEnrollmentResponse = {
  readonly version: 1;
  readonly requestId: string;
  readonly vaultId: string;
  readonly vaultTrustAnchor: LocalVaultTrustAnchor;
  readonly snapshot: VaultSnapshot;
};
