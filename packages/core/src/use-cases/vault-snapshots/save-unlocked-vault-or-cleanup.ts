import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";

export async function saveUnlockedVaultOrCleanup(
  unlockedVaultRepository: UnlockedVaultRepositoryPort,
  unlockedVault: UnlockedVault,
): Promise<void> {
  try {
    await unlockedVaultRepository.saveUnlockedVault(unlockedVault);
  } catch (error) {
    try {
      await unlockedVaultRepository.removeUnlockedVault();
    } catch {
      // Preserve the session save failure as the root cause.
    }

    throw error;
  }
}
