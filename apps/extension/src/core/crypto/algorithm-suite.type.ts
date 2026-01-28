/**
 * Algorithm suite definitions for the cryptographic operations.
 *
 * The system supports named algorithm suites - predefined, validated combinations
 * of cryptographic primitives. Arbitrary mixing of algorithms is not permitted.
 *
 * @see docs/security/security-specification.md Section 3.0
 */

/**
 * Supported algorithm suite identifiers.
 * New suites (e.g., post-quantum) can be added without breaking existing vaults.
 */
export type AlgorithmSuiteId = "suite-v1";

/**
 * Algorithm suite definition specifying all cryptographic primitives.
 * Implementations MUST reject unknown suite or algorithm identifiers.
 */
export interface AlgorithmSuite {
  readonly id: AlgorithmSuiteId;
  readonly signing: "Ed25519";
  readonly keyExchange: "ECDH-P256";
  readonly symmetric: "AES-256-GCM";
  readonly kdf: "PBKDF2";
  readonly keyWrap: "AES-KW";
}
