/**
 * Vault metadata types.
 *
 * Metadata tells the system which crypto profile is used to encrypt and wrap the vault.
 * It is stored once per vault snapshot (not repeated in every payload).
 *
 * The selected profile defines:
 * - algorithm suite (KDF, key wrap, symmetric cipher, signing, etc.)
 * - serialization suite (key formats and encodings)
 */

import type { CryptoProfileId } from "../crypto/profiles/crypto-profile.type";

/**
 * Vault metadata stored alongside each persisted snapshot.
 */
export interface VaultMetadata {
  /**
   * Crypto profile identifier describing the full crypto configuration
   * (algorithms + serialization rules).
   *
   * Implementations MUST reject unknown profile IDs.
   */
  readonly profileId: CryptoProfileId;
}
