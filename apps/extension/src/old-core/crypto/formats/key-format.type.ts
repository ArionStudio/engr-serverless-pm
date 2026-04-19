/**
 * Supported key serialization formats.
 *
 * These map to WebCrypto import/export formats:
 * - "spki" public keys (binary DER)
 * - "pkcs8" private keys (binary DER)
 * - "raw" raw key bytes (commonly symmetric keys; sometimes public keys)
 * - "jwk" JSON Web Key (interop, not ideal for storage)
 */

/** WebCrypto public-key export/import formats supported by this project. */
export type PublicKeyFormat = "spki" | "raw" | "jwk";

/** WebCrypto private-key export/import formats supported by this project. */
export type PrivateKeyFormat = "pkcs8" | "raw" | "jwk";

/**
 * Any supported key format.
 *
 * Use this for APIs that can wrap/unwind any key type.
 */
export type KeyFormat = PublicKeyFormat | PrivateKeyFormat;

/** Binary (non-JWK) public key format for local persistence. */
export type BinaryPublicKeyFormat = Exclude<PublicKeyFormat, "jwk">;

/** Binary (non-JWK) private key format for local persistence. */
export type BinaryPrivateKeyFormat = Exclude<PrivateKeyFormat, "jwk">;
