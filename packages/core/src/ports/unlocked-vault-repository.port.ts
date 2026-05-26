import type { UnlockedVault } from "../domain/vault/unlocked-vault";

export interface UnlockedVaultRepositoryPort {
  saveUnlockedVault: (unlockedVault: UnlockedVault) => Promise<void>;
  getUnlockedVault: () => Promise<UnlockedVault | null>;
  removeUnlockedVault: () => Promise<void>;
}
