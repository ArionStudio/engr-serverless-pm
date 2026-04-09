import type { Aes256GcmKeyWrapAlgorithm } from "./key-wrap.type";

/**
 * AES-256-GCM key wrap (A256GCMKW per RFC 7518 section 4.7).
 */
export const AES_256_GCM_KW: Aes256GcmKeyWrapAlgorithm = {
  kind: "Aes256GcmKeyWrapAlgorithm",
  keyGen: { name: "AES-GCM", length: 256 },
  tagLengthBits: 128,
} as const;
