import type { EcdhP256KeyExchangeAlgorithm } from "./key-exchange.type";

/**
 * ECDH over P-256.
 */
export const ECDH_P256: EcdhP256KeyExchangeAlgorithm = {
  kind: "EcdhP256KeyExchangeAlgorithm",
  algorithm: { name: "ECDH", namedCurve: "P-256" },
} as const;
