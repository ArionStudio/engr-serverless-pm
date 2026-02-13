import type { Aes256KwKeyWrapAlgorithm } from "./key-wrap.type";

/**
 * AES-256-KW (RFC 3394).
 */
export const AES_256_KW: Aes256KwKeyWrapAlgorithm = {
  kind: "Aes256KwKeyWrapAlgorithm",
  keyGen: { name: "AES-KW", length: 256 },
  algorithm: { name: "AES-KW" },
} as const;
