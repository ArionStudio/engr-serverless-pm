/**
 * Algorithm suite constants.
 *
 * Suites are composed from reusable algorithm constants.
 */

import type { AlgorithmSuite } from "./algorithm-suite.type";
import { SHA_256 } from "../algorithms/hashing.const";
import { ED25519 } from "../algorithms/signing.const";
import { ECDH_P256 } from "../algorithms/key-exchange.const";
import { AES_256_GCM } from "../algorithms/symmetric.const";
import { PBKDF2_HMAC_SHA256_600K } from "../algorithms/kdf.const";
import { AES_256_KW } from "../algorithms/key-wrap.const";

/**
 * Default algorithm suite (suite-v1).
 */
export const ALGORITHM_SUITE_V1: AlgorithmSuite = {
  id: "suite-v1",
  hashing: SHA_256,
  signing: ED25519,
  keyExchange: ECDH_P256,
  symmetric: AES_256_GCM,
  kdf: PBKDF2_HMAC_SHA256_600K,
  keyWrap: AES_256_KW,
} as const;

/**
 * Current default algorithm suite.
 */
export const DEFAULT_ALGORITHM_SUITE = ALGORITHM_SUITE_V1;
