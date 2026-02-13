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
 * Only private keys are wrapped. Public keys can be re-exported or stored
 * separately.
 */
export type WrappedDeviceKeys = Readonly<{
  readonly suiteId: AlgorithmSuiteId;
  readonly wrappedSigningPrivateKey: ArrayBuffer;
  readonly wrappedAgreementPrivateKey: ArrayBuffer;
}>;
