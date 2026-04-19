import type { CryptoProfileId } from "../../crypto/domain/crypto-profile.type";

/**
 * Metadata describing how this vault snapshot must be processed.
 */
export interface VaultMetadata {
  readonly profileId: CryptoProfileId;
}
