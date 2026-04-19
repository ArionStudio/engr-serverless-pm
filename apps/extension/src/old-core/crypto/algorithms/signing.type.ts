/**
 * Signing algorithm definitions.
 */

/**
 * Ed25519 signing definition.
 *
 * WebCrypto note: Ed25519 support varies by environment.
 */
export type Ed25519SigningAlgorithm = Readonly<{
  readonly kind: "Ed25519SigningAlgorithm";
  readonly algorithm: Readonly<{ readonly name: "Ed25519" }>;
}>;

/**
 * Signing algorithms supported by the system.
 *
 * Extend by widening this union.
 */
export type SigningAlgorithm = Ed25519SigningAlgorithm;
