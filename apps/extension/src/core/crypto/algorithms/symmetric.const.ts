import type { Aes256GcmSymmetricEncryptionAlgorithm } from "./symmetric.type";

/**
 * AES-256-GCM with 128-bit authentication tag.
 */
export const AES_256_GCM: Aes256GcmSymmetricEncryptionAlgorithm = {
  kind: "Aes256GcmSymmetricEncryptionAlgorithm",
  keyGen: { name: "AES-GCM", length: 256 },
  tagLengthBits: 128,
} as const;
