import type { SerializedEncrypted } from "../../domain/crypto/protected-artifact";
import type { Vault } from "../../domain/vault/vault";

/**
 * Stores the encrypted active unlocked-vault session payload.
 *
 * The payload is an active-session cache, not the durable encrypted vault
 * snapshot source of truth. Implementations may choose the safest available
 * non-session backing store, but must expose only one active payload record and
 * must remove it when the unlocked session is removed.
 */
export interface EncryptedUnlockedVaultSessionPayloadRepositoryPort {
  saveEncryptedUnlockedVaultSessionPayload: (encryptedPayload: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly sourceSnapshotRevision: number;
    readonly content: SerializedEncrypted<{
      readonly vault: Vault;
    }>;
  }) => Promise<void>;
  getEncryptedUnlockedVaultSessionPayload: () => Promise<{
    readonly sessionId: string;
    readonly vaultId: string;
    readonly sourceSnapshotRevision: number;
    readonly content: SerializedEncrypted<{
      readonly vault: Vault;
    }>;
  } | null>;
  removeEncryptedUnlockedVaultSessionPayload: () => Promise<void>;
}
