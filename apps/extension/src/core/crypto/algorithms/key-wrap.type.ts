/**
 * Key wrap algorithm definitions.
 */

/**
 * AES-256-KW (RFC 3394) key wrap definition.
 *
 * WebCrypto usage:
 * - KEK generation: `{ name: "AES-KW", length: 256 }`
 * - wrap/unwrap: `{ name: "AES-KW" }`
 */
export type Aes256KwKeyWrapAlgorithm = Readonly<{
  readonly kind: "Aes256KwKeyWrapAlgorithm";
  readonly keyGen: Readonly<{ readonly name: "AES-KW"; readonly length: 256 }>;
  readonly algorithm: Readonly<{ readonly name: "AES-KW" }>;
}>;

/**
 * Key wrap algorithms supported by the system.
 *
 * Extend by widening this union.
 */
export type KeyWrapAlgorithm = Aes256KwKeyWrapAlgorithm;
