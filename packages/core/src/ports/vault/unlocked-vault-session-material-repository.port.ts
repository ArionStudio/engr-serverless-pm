import type { UnlockedVaultSessionMaterial } from "../../domain/vault/unlocked-vault-session";

/**
 * Stores the active unlocked-vault session material.
 *
 * This record contains the hot secret material required to decrypt and operate
 * on the encrypted unlocked-vault session payload. Implementations should use
 * volatile, session-scoped storage and expose only the active record.
 */
export interface UnlockedVaultSessionMaterialRepositoryPort {
  saveUnlockedVaultSessionMaterial: (
    material: UnlockedVaultSessionMaterial,
  ) => Promise<void>;
  getUnlockedVaultSessionMaterial: () => Promise<UnlockedVaultSessionMaterial | null>;
  removeUnlockedVaultSessionMaterial: () => Promise<void>;
}
