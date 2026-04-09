/**
 * Hash algorithm definitions (WebCrypto digest algorithms).
 */

export type DigestAlgorithmName = "SHA-256";

/**
 * SHA-256 digest algorithm definition.
 *
 * WebCrypto usage:
 * - `crypto.subtle.digest("SHA-256", data)`
 */
export type Sha256DigestAlgorithm = Readonly<{
  readonly kind: "Sha256DigestAlgorithm";
  readonly name: "SHA-256";
}>;

/**
 * Hash algorithms supported by the system.
 *
 * Extend by widening this union.
 */
export type HashAlgorithm = Sha256DigestAlgorithm;
