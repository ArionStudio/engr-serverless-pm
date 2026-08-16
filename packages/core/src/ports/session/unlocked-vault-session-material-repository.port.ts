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
  /**
   * Reads the authoritative cross-context session epoch. The epoch is
   * non-secret, survives material removal for the lifetime of volatile session
   * storage, and defaults to zero when no epoch has been persisted yet.
   */
  getUnlockedVaultSessionEpoch: () => Promise<number>;
  /**
   * Advances the authoritative session epoch while the caller holds the shared
   * clipboard/session coordinator lease.
   */
  advanceUnlockedVaultSessionEpoch: () => Promise<void>;
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
  /**
   * Evicts only this adapter instance's cached material identity, or its cached
   * absence after the caller has proved that a fresh shared identity exists.
   */
  evictCachedUnlockedVaultSessionMaterial: (
    sessionId: string | null,
  ) => Promise<void>;
  removeUnlockedVaultSessionMaterial: () => Promise<void>;
}
