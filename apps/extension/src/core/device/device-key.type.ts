import type { AlgorithmSuiteId } from "../crypto/suites/algorithm-suite.type";
import type {
  DeviceSigningKeyPair,
  DeviceAgreementKeyPair,
} from "../crypto/keys/crypto-keys.type";

/**
 * Device identity keys used by the protocol.
 *
 * Purposes are stable. Algorithms can change between suites without changing
 * this type shape.
 *
 * Uses branded key types for compile-time safety:
 * - Signing keys cannot be confused with agreement keys.
 * - Public keys cannot be confused with private keys.
 */
export type DeviceKeys = Readonly<{
  /** Algorithm suite identifier used to generate/interpret these keys. */
  readonly suiteId: AlgorithmSuiteId;

  /** Device signing keys (suite-defined, e.g. Ed25519 today). */
  readonly signing: DeviceSigningKeyPair;

  /** Device key agreement keys (suite-defined, e.g. ECDH/X25519/etc). */
  readonly agreement: DeviceAgreementKeyPair;
}>;

/**
 * Device public keys exported as JWK for registration / transport.
 */
export type DevicePublicKeysJwk = Readonly<{
  readonly suiteId: AlgorithmSuiteId;
  readonly signingPublicJwk: JsonWebKey;
  readonly agreementPublicJwk: JsonWebKey;
}>;

/**
 * Wrapped device private keys for persistence (e.g. IndexedDB).
 *
 * Private keys are wrapped (encrypted) with the MasterKEK using AES-256-GCM
 * (A256GCMKW). Each wrapped buffer contains `IV (12 bytes) || ciphertext+tag`.
 * Public keys are stored alongside in their raw/spki export format so that
 * `unwrapPrivateKeys()` can reconstruct the full `DeviceKeys` without any
 * network dependency (offline-first). Public keys are public by definition,
 * so storing them unencrypted has no security cost.
 */
export type WrappedDeviceKeys = Readonly<{
  readonly suiteId: AlgorithmSuiteId;
  readonly wrappedSigningPrivateKey: ArrayBuffer;
  readonly wrappedAgreementPrivateKey: ArrayBuffer;
  /** Ed25519 public key exported as "raw" (32 bytes). */
  readonly signingPublicKeyBytes: ArrayBuffer;
  /** ECDH P-256 public key exported as "spki". */
  readonly agreementPublicKeyBytes: ArrayBuffer;
}>;
