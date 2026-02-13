import type { MasterKEK } from "../crypto/keys/crypto-keys.type";
import type { AlgorithmSuite } from "../crypto/suites/algorithm-suite.type";
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
 * The concrete algorithms for these purposes are defined by the provided
 * `AlgorithmSuite`. This keeps the device model stable when you add new suites.
 */
export interface DeviceKeyPort {
  /**
   * Generate device identity keys according to the algorithm suite.
   *
   * @param suite - Algorithm suite configuration
   * @returns Fresh device keys (signing + agreement)
   */
  generateKeys(suite: AlgorithmSuite): Promise<DeviceKeys>;

  /**
   * Export device public keys as JWK for registration / transport.
   *
   * @param suite - Algorithm suite configuration
   * @param keys - Device keys
   * @returns JWK-encoded public keys
   */
  exportPublicKeysJwk(
    suite: AlgorithmSuite,
    keys: DeviceKeys,
  ): Promise<DevicePublicKeysJwk>;

  /**
   * Wrap device private keys using the MasterKEK for persistence.
   *
   * @param suite - Algorithm suite configuration
   * @param keys - Device keys (contains private keys)
   * @param masterKEK - Master key encryption key used for wrapping
   * @returns Wrapped private keys safe for storage
   */
  wrapPrivateKeys(
    suite: AlgorithmSuite,
    keys: DeviceKeys,
    masterKEK: MasterKEK,
  ): Promise<WrappedDeviceKeys>;

  /**
   * Unwrap device private keys using the MasterKEK when loading from storage.
   *
   * @param suite - Algorithm suite configuration
   * @param wrapped - Wrapped private keys from persistence
   * @param masterKEK - Master key encryption key used for unwrapping
   * @returns Device keys reconstituted for runtime use
   */
  unwrapPrivateKeys(
    suite: AlgorithmSuite,
    wrapped: WrappedDeviceKeys,
    masterKEK: MasterKEK,
  ): Promise<DeviceKeys>;

  /**
   * Sign data using the device signing private key (suite-defined algorithm).
   *
   * @param suite - Algorithm suite configuration
   * @param data - Data to sign
   * @param keys - Device keys (contains signing private key)
   * @returns Signature bytes
   */
  sign(
    suite: AlgorithmSuite,
    data: BufferSource,
    keys: DeviceKeys,
  ): Promise<Uint8Array>;

  /**
   * Verify a signature using a signing public key (JWK).
   *
   * @param suite - Algorithm suite configuration
   * @param data - Original data
   * @param signature - Signature bytes
   * @param signingPublicJwk - Signing public key in JWK format
   * @returns True if the signature is valid
   */
  verify(
    suite: AlgorithmSuite,
    data: BufferSource,
    signature: BufferSource,
    signingPublicJwk: JsonWebKey,
  ): Promise<boolean>;

  /**
   * Derive a shared secret using the device agreement private key and a remote
   * agreement public key (JWK). The concrete key agreement algorithm is defined
   * by the suite.
   *
   * @param suite - Algorithm suite configuration
   * @param keys - Device keys (contains agreement private key)
   * @param remoteAgreementPublicJwk - Remote agreement public key in JWK format
   * @returns Derived secret bytes
   */
  deriveSharedSecret(
    suite: AlgorithmSuite,
    keys: DeviceKeys,
    remoteAgreementPublicJwk: JsonWebKey,
  ): Promise<Uint8Array>;
}
