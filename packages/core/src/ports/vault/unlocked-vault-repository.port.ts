import type { UnlockedVaultSession } from "../../domain/vault/unlocked-vault-session";

/**
 * Stores the active unlocked vault session.
 *
 * Implementations may compose UnlockedVaultSessionMaterialRepositoryPort and
 * EncryptedUnlockedVaultSessionPayloadRepositoryPort, but core depends only on
 * these semantics:
 *
 * - at most one unlocked vault session is active at a time
 * - saving creates the first active session or updates the same active vault
 * - saving a different vault while one is active must fail
 * - getting returns null when no valid active session exists
 * - removing makes the active session unavailable and is idempotent
 * - durable encrypted vault snapshots are managed by VaultLocalRepositoryPort
 */
export interface UnlockedVaultRepositoryPort {
  saveUnlockedVaultSession: (session: UnlockedVaultSession) => Promise<void>;
  getUnlockedVaultSession: () => Promise<UnlockedVaultSession | null>;
  removeUnlockedVaultSession: () => Promise<void>;
}
