/**
 * Supported public key serialization formats used by the protocol.
 *
 * These map to WebCrypto import/export formats.
 */
export type PublicKeyFormat = "raw" | "spki";

/**
 * Supported private key serialization formats used for persistence.
 *
 * These map to WebCrypto import/export formats.
 */
export type PrivateKeyFormat = "pkcs8";

/**
 * Any supported key serialization format.
 */
export type KeyFormat = PublicKeyFormat | PrivateKeyFormat;
