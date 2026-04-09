/**
 * Algorithm suite types.
 *
 * Suites are named, validated combinations of primitives.
 */

import type { HashAlgorithm } from "../algorithms/hashing.type";
import type { SigningAlgorithm } from "../algorithms/signing.type";
import type { KeyExchangeAlgorithm } from "../algorithms/key-exchange.type";
import type { SymmetricEncryptionAlgorithm } from "../algorithms/symmetric.type";
import type { KdfAlgorithm } from "../algorithms/kdf.type";
import type { KeyWrapAlgorithm } from "../algorithms/key-wrap.type";

/**
 * Supported algorithm suite identifiers.
 */
export type AlgorithmSuiteId = "suite-v1";

/**
 * Algorithm suite definition specifying all cryptographic primitives.
 *
 * Implementations MUST reject unknown suite IDs or algorithm kinds.
 */
export interface AlgorithmSuite {
  readonly id: AlgorithmSuiteId;

  readonly hashing: HashAlgorithm;
  readonly signing: SigningAlgorithm;
  readonly keyExchange: KeyExchangeAlgorithm;
  readonly symmetric: SymmetricEncryptionAlgorithm;
  readonly kdf: KdfAlgorithm;
  readonly keyWrap: KeyWrapAlgorithm;
}
