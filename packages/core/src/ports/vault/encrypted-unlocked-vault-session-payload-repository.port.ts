import type { EncryptedUnlockedVaultSessionPayload } from "../../domain/vault/unlocked-vault-session";

/**
 * Stores the encrypted active unlocked-vault session payload.
 *
 * The payload is an active-session cache, not the durable encrypted vault
 * snapshot source of truth. Implementations may choose the safest available
 * non-session backing store, but must expose only one active payload record and
 * must remove it when the unlocked session is removed.
 */
export interface EncryptedUnlockedVaultSessionPayloadRepositoryPort {
  saveEncryptedUnlockedVaultSessionPayload: (
    encryptedPayload: EncryptedUnlockedVaultSessionPayload,
  ) => Promise<void>;
  getEncryptedUnlockedVaultSessionPayload: () => Promise<EncryptedUnlockedVaultSessionPayload | null>;
  removeEncryptedUnlockedVaultSessionPayload: () => Promise<void>;
}
