/**
 * Key exchange algorithm definitions.
 */

/**
 * ECDH P-256 key exchange definition.
 *
 * WebCrypto usage:
 * - generate/import keys: `{ name: "ECDH", namedCurve: "P-256" }`
 */
export type EcdhP256KeyExchangeAlgorithm = Readonly<{
  readonly kind: "EcdhP256KeyExchangeAlgorithm";
  readonly algorithm: Readonly<{
    readonly name: "ECDH";
    readonly namedCurve: "P-256";
  }>;
}>;

/**
 * Key exchange algorithms supported by the system.
 *
 * Extend by widening this union.
 */
export type KeyExchangeAlgorithm = EcdhP256KeyExchangeAlgorithm;
