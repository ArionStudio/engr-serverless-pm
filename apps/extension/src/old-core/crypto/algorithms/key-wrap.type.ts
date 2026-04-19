/**
 * Key wrap algorithm definitions.
 */

/**
 * AES-256-GCM key wrap definition (A256GCMKW per RFC 7518 section 4.7).
 *
 * WebCrypto usage:
 * - KEK generation: `{ name: "AES-GCM", length: 256 }`
 * - wrap/unwrap: `{ name: "AES-GCM", iv, tagLength: 128 }`
 *
 * Output format: `IV (12 bytes) || ciphertext+tag`
 */
export type Aes256GcmKeyWrapAlgorithm = Readonly<{
  readonly kind: "Aes256GcmKeyWrapAlgorithm";
  readonly keyGen: Readonly<{ readonly name: "AES-GCM"; readonly length: 256 }>;
  readonly tagLengthBits: 128;
}>;

/**
 * Key wrap algorithms supported by the system.
 *
 * Extend by widening this union.
 */
export type KeyWrapAlgorithm = Aes256GcmKeyWrapAlgorithm;
