/**
 * Device key service port interface.
 *
 * Defines the contract for device key management.
 * Handles key generation, wrapping, and unwrapping.
 *
 * @see docs/security/security-specification.md Section 4
 */

import type { MasterKEK } from "../crypto/crypto.type";
import type {
  DeviceKeyPair,
  DevicePublicKeys,
  WrappedDeviceKeys,
} from "./device-key.type";

/**
 * Device key service port interface.
 *
 * Core layer defines the interface; adapters provide WebCrypto implementation.
 */
export interface IDeviceKeyService {
  /**
   * Generate a new device key pair.
   * Creates both Ed25519 (signing) and ECDH P-256 (exchange) key pairs.
   *
   * @returns New device key pair with private keys extractable for initial wrapping
   */
  generateKeyPair(): Promise<DeviceKeyPair>;

  /**
   * Wrap device private keys with MasterKEK for storage.
   *
   * @param keyPair - Device key pair to wrap
   * @param masterKEK - Master key encryption key
   * @returns Wrapped keys safe for IndexedDB storage
   */
  wrapKeys(
    keyPair: DeviceKeyPair,
    masterKEK: MasterKEK,
  ): Promise<WrappedDeviceKeys>;

  /**
   * Unwrap device private keys from storage.
   *
   * @param wrappedKeys - Wrapped keys from IndexedDB
   * @param masterKEK - Master key encryption key
   * @returns Unwrapped device key pair (non-extractable)
   */
  unwrapKeys(
    wrappedKeys: WrappedDeviceKeys,
    masterKEK: MasterKEK,
  ): Promise<DeviceKeyPair>;

  /**
   * Export device public keys as JWK for registration.
   *
   * @param keyPair - Device key pair
   * @returns Public keys in JWK format
   */
  exportPublicKeys(keyPair: DeviceKeyPair): Promise<DevicePublicKeys>;

  /**
   * Sign data with device signing key (Ed25519).
   *
   * @param data - Data to sign
   * @param keyPair - Device key pair
   * @returns Signature bytes (64 bytes for Ed25519)
   */
  sign(data: Uint8Array, keyPair: DeviceKeyPair): Promise<Uint8Array>;

  /**
   * Verify signature with device signing key.
   *
   * @param data - Original data
   * @param signature - Signature to verify
   * @param publicKey - Public signing key (JWK)
   * @returns True if signature is valid
   */
  verify(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: JsonWebKey,
  ): Promise<boolean>;

  /**
   * Derive shared secret using ECDH for key slot creation.
   *
   * @param privateKey - Local ECDH private key
   * @param publicKey - Remote ECDH public key (JWK)
   * @returns Derived secret bytes
   */
  deriveSharedSecret(
    privateKey: CryptoKey,
    publicKey: JsonWebKey,
  ): Promise<Uint8Array>;
}
