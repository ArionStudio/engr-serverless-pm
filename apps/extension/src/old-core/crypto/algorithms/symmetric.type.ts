/**
 * Symmetric encryption algorithm definitions.
 */

/**
 * AES-256-GCM symmetric encryption definition.
 *
 * WebCrypto usage:
 * - generate key: `{ name: "AES-GCM", length: 256 }`
 * - encrypt/decrypt: `{ name: "AES-GCM", iv, additionalData?, tagLength: 128 }`
 */
export type Aes256GcmSymmetricEncryptionAlgorithm = Readonly<{
  readonly kind: "Aes256GcmSymmetricEncryptionAlgorithm";
  readonly keyGen: Readonly<{ readonly name: "AES-GCM"; readonly length: 256 }>;
  readonly tagLengthBits: 128;
}>;

/**
 * Symmetric encryption algorithms supported by the system.
 *
 * Extend by widening this union.
 */
export type SymmetricEncryptionAlgorithm =
  Aes256GcmSymmetricEncryptionAlgorithm;
