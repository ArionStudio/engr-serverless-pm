import type { AlgorithmSuiteId } from "../suites/algorithm-suite.type";
import type { SerializationSuiteId } from "../formats/serialization-suite.type";

export type CryptoProfileId = "profile-v1";

/**
 * CryptoProfile composes all crypto decisions:
 * - algorithms (kdf/signing/agreement/wrap/symmetric)
 * - serialization formats
 *
 * This keeps your existing `AlgorithmSuite` clean while still making formats
 * versioned and selectable.
 */
export type CryptoProfile = Readonly<{
  readonly id: CryptoProfileId;
  readonly algorithmSuiteId: AlgorithmSuiteId;
  readonly serializationSuiteId: SerializationSuiteId;
}>;
