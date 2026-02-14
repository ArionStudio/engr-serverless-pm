import type { MasterKEK } from "../crypto/keys/crypto-keys.type";
import type { CryptoProfile } from "../crypto/profiles/crypto-profile.type";
import type {
  DeviceKeys,
  DevicePublicKeysJwk,
  WrappedDeviceKeys,
} from "./device-key.type";

/**
 * Device key service port interface.
 *
 * Purpose-based device identity crypto:
 * - signing
 * - agreement (key agreement / exchange)
 *
 * The concrete algorithms and serialization formats are defined by the provided
 * `CryptoProfile`. This keeps the device model stable when you add new suites.
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
   * Export device public keys as JWK for registration / transport.
   *
   * @param profile - Crypto profile configuration
   * @param keys - Device keys
   * @returns JWK-encoded public keys
   */
  exportPublicKeysJwk(
    profile: CryptoProfile,
    keys: DeviceKeys,
  ): Promise<DevicePublicKeysJwk>;

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
   * Verify a signature using a signing public key (JWK).
   *
   * @param profile - Crypto profile configuration
   * @param data - Original data
   * @param signature - Signature bytes
   * @param signingPublicJwk - Signing public key in JWK format
   * @returns True if the signature is valid
   */
  verify(
    profile: CryptoProfile,
    data: BufferSource,
    signature: BufferSource,
    signingPublicJwk: JsonWebKey,
  ): Promise<boolean>;

  /**
   * Derive a shared secret using the device agreement private key and a remote
   * agreement public key (JWK). The concrete key agreement algorithm is defined
   * by the suite.
   *
   * @param profile - Crypto profile configuration
   * @param keys - Device keys (contains agreement private key)
   * @param remoteAgreementPublicJwk - Remote agreement public key in JWK format
   * @returns Derived secret bytes
   */
  deriveSharedSecret(
    profile: CryptoProfile,
    keys: DeviceKeys,
    remoteAgreementPublicJwk: JsonWebKey,
  ): Promise<Uint8Array>;
}
