import type {
  DeviceAgreementKeyPair,
  DeviceSigningKeyPair,
} from "../../crypto/domain/crypto-keys.type";
import type { PublicKeyFormat } from "../../crypto/domain/key-format.type";

/**
 * Binary public key material exported together with its serialization format.
 *
 * The bytes are opaque to the domain and are interpreted according to `format`.
 */
export type ExportedPublicKeyMaterial = Readonly<{
  readonly format: PublicKeyFormat;
  readonly data: ArrayBuffer;
}>;

/**
 * Public device keys exported for registration, transport, and verification.
 */
export type ExportedDevicePublicKeys = Readonly<{
  readonly signing: ExportedPublicKeyMaterial;
  readonly agreement: ExportedPublicKeyMaterial;
}>;

/**
 * Device identity key pairs used by the protocol.
 *
 * Purposes are stable even if cryptographic algorithms change in future profiles.
 */
export type DeviceKeys = Readonly<{
  readonly signing: DeviceSigningKeyPair;
  readonly agreement: DeviceAgreementKeyPair;
}>;

/**
 * Wrapped device private keys persisted in local storage.
 *
 * Private keys are wrapped with the MasterKEK.
 * Public keys are stored alongside so the full device key set can be restored
 * without network access.
 */
export type WrappedDeviceKeys = Readonly<{
  readonly wrappedSigningPrivateKey: ArrayBuffer;
  readonly wrappedAgreementPrivateKey: ArrayBuffer;
  readonly signingPublicKeyBytes: ArrayBuffer;
  readonly agreementPublicKeyBytes: ArrayBuffer;
}>;
