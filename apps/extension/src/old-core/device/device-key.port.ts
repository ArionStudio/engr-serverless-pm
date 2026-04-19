import type { MasterKEK, SlotKEK } from "../crypto/keys/crypto-keys.type";
import type { CryptoProfile } from "../crypto/profiles/crypto-profile.type";
import type {
  DeviceKeys,
  ExportedDevicePublicKeys,
  ExportedPublicKeyMaterial,
  WrappedDeviceKeys,
} from "./device-key.type";

/**
 * Device key service port interface.
 *
 * Purpose-based device identity crypto:
 * - signing and signature verification for vault authenticity
 * - agreement key handling for safe device slot derivation
 *
 * This port is serialization-neutral. Public keys are exchanged as exported
 * key material together with an explicit format tag rather than a hard-coded
 * transport representation such as JWK.
 *
 * The concrete algorithms and supported serialization formats are defined by
 * the provided `CryptoProfile`. This keeps the device-key model stable when
 * new reviewed suites are introduced.
 */

export interface DeviceKeyPort {
  /**
   * Generate device identity keys according to the crypto profile.
   *
   * @param profile - Crypto profile configuration
   * @returns Fresh device keys (signing + agreement)
   */
  generateKeys(profile: CryptoProfile): Promise<DeviceKeys>;

  /**
   * Export device public keys for registration / transport.
   *
   * @param profile - Crypto profile configuration
   * @param keys - Device keys
   * @returns Public keys encoded in profile-defined export formats
   */
  exportPublicKeys(
    profile: CryptoProfile,
    keys: DeviceKeys,
  ): Promise<ExportedDevicePublicKeys>;

  /**
   * Wrap device private keys using the MasterKEK for persistence.
   *
   * @param profile - Crypto profile configuration
   * @param keys - Device keys (contains private keys)
   * @param masterKEK - Master key encryption key used for wrapping
   * @returns Wrapped private keys safe for storage
   */
  wrapPrivateKeys(
    profile: CryptoProfile,
    keys: DeviceKeys,
    masterKEK: MasterKEK,
  ): Promise<WrappedDeviceKeys>;

  /**
   * Unwrap device private keys using the MasterKEK when loading from storage.
   *
   * @param profile - Crypto profile configuration
   * @param wrapped - Wrapped private keys from persistence
   * @param masterKEK - Master key encryption key used for unwrapping
   * @returns Device keys reconstituted for runtime use
   */
  unwrapPrivateKeys(
    profile: CryptoProfile,
    wrapped: WrappedDeviceKeys,
    masterKEK: MasterKEK,
  ): Promise<DeviceKeys>;

  /**
   * Sign data using the device signing private key (suite-defined algorithm).
   *
   * @param profile - Crypto profile configuration
   * @param data - Data to sign
   * @param keys - Device keys (contains signing private key)
   * @returns Signature bytes
   */
  sign(
    profile: CryptoProfile,
    data: BufferSource,
    keys: DeviceKeys,
  ): Promise<Uint8Array>;

  /**
   * Verify a signature using exported signing public key material.
   *
   * @param profile - Crypto profile configuration
   * @param data - Original data
   * @param signature - Signature bytes
   * @param signingPublicKey - Signing public key in an explicit export format
   * @returns True if the signature is valid
   */
  verify(
    profile: CryptoProfile,
    data: BufferSource,
    signature: BufferSource,
    signingPublicKey: ExportedPublicKeyMaterial,
  ): Promise<boolean>;

  /**
   * Derive a SlotKEK for device key-slot operations.
   *
   * This method performs the safe agreement-based derivation pipeline:
   * 1. Use the local device agreement private key
   * 2. Use the remote or ephemeral agreement public key
   * 3. Perform key agreement
   * 4. Apply the required profile-defined KDF and context binding
   *
   * Raw agreement output is an internal intermediate only and MUST NOT be
   * exposed by the public port.
   *
   * @param profile - Crypto profile configuration
   * @param keys - Device keys (contains agreement private key)
   * @param remoteAgreementPublicKey - Remote or ephemeral agreement public key
   * @returns Derived SlotKEK suitable for VaultKey wrapping/unwrapping
   */
  deriveSlotKEK(
    profile: CryptoProfile,
    keys: DeviceKeys,
    remoteAgreementPublicKey: ExportedPublicKeyMaterial,
  ): Promise<SlotKEK>;
}
