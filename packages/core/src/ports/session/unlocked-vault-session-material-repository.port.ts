import type { UnlockedVaultSessionMaterial } from "../../domain/session/unlocked-vault-session.type";

/**
 * Stores the active unlocked-vault session material.
 *
 * This record contains the hot secret material required to decrypt and operate
 * on the encrypted unlocked-vault session payload. A successful save transfers
 * custody of the material buffers to the repository while the serialized
 * session service remains their wipe owner. Within one repository instance,
 * subsequent reads must return the same material identity until it is replaced,
 * removed, or explicitly evicted after a shared-identity mismatch. An
 * implementation that restores serialized state must cache the first decoded
 * material identity. This lets the session owner wipe every outstanding
 * reference before repository removal or local cache eviction.
 * Implementations should use volatile, session-scoped storage and expose only
 * the active record.
 */
export interface UnlockedVaultSessionMaterialRepositoryPort {
  saveUnlockedVaultSessionMaterial: (
    material: UnlockedVaultSessionMaterial,
  ) => Promise<void>;
  getUnlockedVaultSessionMaterial: () => Promise<UnlockedVaultSessionMaterial | null>;
  /**
   * Reads the current shared identity without consulting an instance-local
   * material cache. Callers use this inside their cross-context coordinator.
   */
  getPersistedUnlockedVaultSessionIdentity: () => Promise<Pick<
    UnlockedVaultSessionMaterial,
    "sessionId" | "vaultId" | "sourceSnapshotVersionVector"
  > | null>;
  /** Evicts only this adapter instance's cached material identity. */
  evictCachedUnlockedVaultSessionMaterial: (sessionId: string) => Promise<void>;
  removeUnlockedVaultSessionMaterial: () => Promise<void>;
}
