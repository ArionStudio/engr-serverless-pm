/**
 * Crypto-related constants (sizes, defaults).
 */

/**
 * Default salt length for PBKDF2 in bytes.
 */
export const DEFAULT_SALT_LENGTH_BYTES = 32 as const;

/**
 * IV length for AES-GCM in bytes (96-bit IV).
 */
export const AES_GCM_IV_LENGTH_BYTES = 12 as const;
